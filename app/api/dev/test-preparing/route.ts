import { Timestamp, FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function POST(request: Request) {
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

    const deviceSnapshot = await adminDb
      .collection("devices")
      .doc(deviceId)
      .get();

    if (!deviceSnapshot.exists) {
      return Response.json(
        {
          success: false,
          error: `Device ${deviceId} tidak ditemukan`,
        },
        { status: 404 },
      );
    }

    const device = deviceSnapshot.data()!;

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
            "Selesaikan billing sebelum test watchdog.",
        },
        { status: 409 },
      );
    }

    const existingPreparing = await adminDb
      .collection("preparing_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "PREPARING")
      .limit(1)
      .get();

    if (!existingPreparing.empty) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} masih memiliki PREPARING aktif. ` +
            "Tutup dulu sebelum membuat test dummy.",
        },
        { status: 409 },
      );
    }

    const startedAt = Timestamp.fromMillis(
      Date.now() - minutesAgo * 60_000,
    );

    const ref = adminDb
      .collection("preparing_sessions")
      .doc();

    await ref.set({
      deviceId,
      cafeId: device.cafeId ?? user.profile?.cafeId ?? null,

      status: "PREPARING",
      startedAt,
      activatedAt: null,
      endedAt: null,
      billingSessionId: null,

      operatorUid: user.uid,
      operatorEmail: user.email,

      testMode: true,
      testMinutesAgo: minutesAgo,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      success: true,
      preparingId: ref.id,
      deviceId,
      minutesAgo,
      message:
        `${deviceId} dibuat PREPARING test seolah-olah mulai ${minutesAgo} menit lalu.`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal membuat PREPARING test";

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
