import { Timestamp, FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function PATCH(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        {
          success: false,
          error: "Endpoint test tidak tersedia di production",
        },
        { status: 403 },
      );
    }

    const user = await requireUserFromRequest(request);

    if (user.profile?.role !== "admin") {
      return Response.json(
        {
          success: false,
          error: "Admin only",
        },
        { status: 403 },
      );
    }

    const body = await request.json();

    const deviceId = String(body.deviceId ?? "PS01")
      .trim()
      .toUpperCase();

    const minutesAgo = Math.max(
      60,
      Number(body.minutesAgo ?? 61),
    );

    const activeBilling = await adminDb
      .collection("sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "ACTIVE")
      .limit(1)
      .get();

    if (!activeBilling.empty) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} sedang memiliki billing ACTIVE. ` +
            "Watchdog test tidak boleh dijalankan saat rental aktif.",
        },
        { status: 409 },
      );
    }

    const snapshot = await adminDb
      .collection("preparing_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "PREPARING")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} belum memiliki PREPARING aktif. ` +
            "Tekan POWER ON terlebih dahulu.",
        },
        { status: 404 },
      );
    }

    const doc = snapshot.docs[0];

    const startedAt = Timestamp.fromMillis(
      Date.now() - minutesAgo * 60_000,
    );

    await doc.ref.update({
      startedAt,
      testMode: true,
      testMinutesAgo: minutesAgo,
      testAgedAt: FieldValue.serverTimestamp(),
      testAgedByUid: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      success: true,
      preparingId: doc.id,
      deviceId,
      minutesAgo,
      message:
        `${deviceId} PREPARING aktif diubah seolah-olah mulai ${minutesAgo} menit lalu.`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengubah umur PREPARING";

    return Response.json(
      {
        success: false,
        error:
          message === "UNAUTHORIZED"
            ? "Unauthorized"
            : message,
      },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}
