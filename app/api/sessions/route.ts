import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { resolveRentalPackage } from "@/lib/rental-packages";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json();

    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();
    const preparingId = String(body.preparingId ?? "").trim();
    const rentalPackage = resolveRentalPackage({
      packageId: body.packageId,
      name: body.packageName,
      durationMinutes: body.durationMinutes,
      price: body.price,
    });

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    if (!rentalPackage) {
      return Response.json(
        {
          success: false,
          error: "Paket rental tidak valid. Gunakan paket resmi Noir Playbox.",
        },
        { status: 400 },
      );
    }

    const deviceRef = adminDb.collection("devices").doc(deviceId);
    const sessionRef = adminDb.collection("sessions").doc();
    const packageRef = sessionRef.collection("packages").doc();
    const preparingRef = preparingId
      ? adminDb.collection("preparing_sessions").doc(preparingId)
      : null;

    let cafeId = "";
    let preparingConverted = false;
    const startedAt = Timestamp.now();

    await adminDb.runTransaction(async (transaction) => {
      const deviceDoc = await transaction.get(deviceRef);

      if (!deviceDoc.exists) {
        throw new Error("DEVICE_NOT_FOUND");
      }

      const deviceData = deviceDoc.data()!;
      cafeId = typeof deviceData.cafeId === "string" ? deviceData.cafeId : "";

      if (!cafeId) {
        throw new Error("DEVICE_CAFE_MISSING");
      }

      if (
        user.profile?.role === "operational" &&
        user.profile?.cafeId !== cafeId
      ) {
        throw new Error("DEVICE_FORBIDDEN");
      }

      const activeQuery = adminDb
        .collection("sessions")
        .where("deviceId", "==", deviceId)
        .where("status", "==", "ACTIVE")
        .limit(1);

      const activeSnapshot = await transaction.get(activeQuery);

      if (!activeSnapshot.empty) {
        throw new Error("SESSION_ACTIVE");
      }

      let resolvedPreparingRef = preparingRef;
      let preparingData: FirebaseFirestore.DocumentData | null = null;

      if (resolvedPreparingRef) {
        const preparingSnapshot = await transaction.get(resolvedPreparingRef);

        if (!preparingSnapshot.exists) {
          throw new Error("PREPARING_NOT_FOUND");
        }

        preparingData = preparingSnapshot.data() ?? null;
      } else {
        /*
         * Fallback server-side: jika client belum sempat menerima preparingId,
         * cari PREPARING aktif untuk device ini. Dengan begitu billing tetap
         * mengonversi audit PREPARING tanpa request PATCH tambahan.
         */
        const preparingQuery = adminDb
          .collection("preparing_sessions")
          .where("deviceId", "==", deviceId)
          .where("status", "==", "PREPARING")
          .limit(1);

        const preparingSnapshot = await transaction.get(preparingQuery);

        if (!preparingSnapshot.empty) {
          const preparingDoc = preparingSnapshot.docs[0];
          resolvedPreparingRef = preparingDoc.ref;
          preparingData = preparingDoc.data();
        }
      }

      if (preparingData) {
        if (preparingData.status !== "PREPARING") {
          throw new Error("PREPARING_NOT_ACTIVE");
        }

        if (
          String(preparingData.deviceId ?? "").toUpperCase() !== deviceId ||
          String(preparingData.cafeId ?? "") !== cafeId
        ) {
          throw new Error("PREPARING_MISMATCH");
        }
      }

      transaction.set(sessionRef, {
        deviceId,
        cafeId,
        status: "ACTIVE",
        startedAt,
        endedAt: null,
        totalMinutes: rentalPackage.durationMinutes,
        totalPrice: rentalPackage.price,
        operatorUid: user.uid,
        operatorEmail: user.email ?? null,
        createdAt: startedAt,
        updatedAt: startedAt,
      });

      transaction.set(packageRef, {
        packageId: rentalPackage.id,
        name: rentalPackage.name,
        durationMinutes: rentalPackage.durationMinutes,
        durationSeconds: rentalPackage.durationMinutes * 60,
        price: rentalPackage.price,
        type: "INITIAL",
        addedAt: startedAt,
      });

      if (resolvedPreparingRef && preparingData) {
        transaction.update(resolvedPreparingRef, {
          status: "CONVERTED_TO_BILLING",
          billingSessionId: sessionRef.id,
          activatedAt: startedAt,
          updatedAt: startedAt,
        });

        preparingConverted = true;
      }
    });

    return Response.json({
      success: true,
      sessionId: sessionRef.id,
      cafeId,
      preparingConverted,
      session: {
        id: sessionRef.id,
        deviceId,
        status: "ACTIVE",
        startedAt: startedAt.toDate().toISOString(),
        endedAt: null,
        totalMinutes: rentalPackage.durationMinutes,
        totalPrice: rentalPackage.price,
      },
      package: {
        id: packageRef.id,
        packageId: rentalPackage.id,
        name: rentalPackage.name,
        durationMinutes: rentalPackage.durationMinutes,
        durationSeconds: rentalPackage.durationMinutes * 60,
        price: rentalPackage.price,
        type: "INITIAL",
        addedAt: startedAt.toDate().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat session";

    if (message === "DEVICE_NOT_FOUND") {
      return Response.json(
        { success: false, error: "PlayBox belum terdaftar" },
        { status: 400 },
      );
    }

    if (message === "DEVICE_CAFE_MISSING") {
      return Response.json(
        { success: false, error: "PlayBox belum memiliki cafeId" },
        { status: 400 },
      );
    }

    if (message === "DEVICE_FORBIDDEN") {
      return Response.json(
        { success: false, error: "Tidak memiliki akses ke PlayBox ini" },
        { status: 403 },
      );
    }

    if (message === "SESSION_ACTIVE") {
      return Response.json(
        { success: false, error: "PlayBox masih memiliki session ACTIVE" },
        { status: 409 },
      );
    }

    if (message === "PREPARING_NOT_FOUND") {
      return Response.json(
        { success: false, error: "PREPARING tidak ditemukan" },
        { status: 409 },
      );
    }

    if (message === "PREPARING_NOT_ACTIVE") {
      return Response.json(
        { success: false, error: "PREPARING sudah tidak aktif" },
        { status: 409 },
      );
    }

    if (message === "PREPARING_MISMATCH") {
      return Response.json(
        { success: false, error: "PREPARING tidak sesuai dengan PlayBox" },
        { status: 409 },
      );
    }

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
