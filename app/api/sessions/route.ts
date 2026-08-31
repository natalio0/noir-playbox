import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { resolveRentalPackage } from "@/lib/rental-packages";
import { createPerfTrace } from "@/lib/perf-trace";

export async function POST(request: Request) {
  const trace = createPerfTrace("api.sessions.create");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const body = await trace.measure("requestJson", () => request.json());

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

    await trace.measure("firestoreTransaction", () =>
      adminDb.runTransaction(async (transaction) => {
      const deviceDoc = await trace.measure("tx.deviceRead", () =>
        transaction.get(deviceRef),
      );

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

      const activeShutdownQuery = adminDb
        .collection("shutdown_sessions")
        .where("deviceId", "==", deviceId)
        .where("status", "==", "SHUTDOWN_ACTIVE")
        .limit(1);

      const pendingShutdownQuery = adminDb
        .collection("shutdown_sessions")
        .where("deviceId", "==", deviceId)
        .where("status", "==", "SHUTDOWN_PENDING")
        .limit(1);

      const activeSnapshot = await trace.measure("tx.activeSessionQuery", () =>
        transaction.get(activeQuery),
      );
      const activeShutdownSnapshot = await trace.measure("tx.activeShutdownQuery", () =>
        transaction.get(activeShutdownQuery),
      );
      const pendingShutdownSnapshot = await trace.measure("tx.pendingShutdownQuery", () =>
        transaction.get(pendingShutdownQuery),
      );

      if (!activeSnapshot.empty) {
        throw new Error("SESSION_ACTIVE");
      }

      if (!activeShutdownSnapshot.empty) {
        throw new Error("SHUTDOWN_ACTIVE");
      }

      let resolvedPreparingRef = preparingRef;
      let preparingData: FirebaseFirestore.DocumentData | null = null;

      if (resolvedPreparingRef) {
        const preparingSnapshot = await trace.measure("tx.preparingDocRead", () =>
          transaction.get(resolvedPreparingRef!),
        );

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

        const preparingSnapshot = await trace.measure("tx.preparingQuery", () =>
          transaction.get(preparingQuery),
        );

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

      /*
       * Jika rental baru benar-benar dimulai, shutdown pending dari rental
       * sebelumnya otomatis ditutup sebagai reuse. Ini fallback server-side
       * agar pending lama tidak pernah menggantung walau request skip client
       * terlambat atau browser berpindah halaman.
       */
      if (!pendingShutdownSnapshot.empty) {
        transaction.update(pendingShutdownSnapshot.docs[0].ref, {
          status: "SHUTDOWN_SKIPPED_REUSED",
          endedAt: startedAt,
          updatedAt: startedAt,
        });
      }

      if (resolvedPreparingRef && preparingData) {
        transaction.update(resolvedPreparingRef, {
          status: "CONVERTED_TO_BILLING",
          billingSessionId: sessionRef.id,
          activatedAt: startedAt,
          updatedAt: startedAt,
        });

        preparingConverted = true;
      }
    }),
    );

    trace.finish("ok", { preparingConverted });

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
    trace.finish("error");
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

    if (message === "SHUTDOWN_ACTIVE") {
      return Response.json(
        {
          success: false,
          error: "Shutdown Mode masih aktif. Selesaikan shutdown terlebih dahulu.",
        },
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
