import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { resolveRentalPackage } from "@/lib/rental-packages";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json();

    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();
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

    let cafeId = "";

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

      /*
       * Query ACTIVE dijalankan di transaction agar dua request START yang
       * datang bersamaan tidak sama-sama lolos pengecekan.
       */
      const activeQuery = adminDb
        .collection("sessions")
        .where("deviceId", "==", deviceId)
        .where("status", "==", "ACTIVE")
        .limit(1);

      const activeSnapshot = await transaction.get(activeQuery);

      if (!activeSnapshot.empty) {
        throw new Error("SESSION_ACTIVE");
      }

      transaction.set(sessionRef, {
        deviceId,
        cafeId,
        status: "ACTIVE",
        startedAt: FieldValue.serverTimestamp(),
        endedAt: null,
        totalMinutes: rentalPackage.durationMinutes,
        totalPrice: rentalPackage.price,
        operatorUid: user.uid,
        operatorEmail: user.email ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(packageRef, {
        packageId: rentalPackage.id,
        name: rentalPackage.name,
        durationMinutes: rentalPackage.durationMinutes,
        durationSeconds: rentalPackage.durationMinutes * 60,
        price: rentalPackage.price,
        type: "INITIAL",
        addedAt: FieldValue.serverTimestamp(),
      });
    });

    return Response.json({
      success: true,
      sessionId: sessionRef.id,
      cafeId,
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

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
