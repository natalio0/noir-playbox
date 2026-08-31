import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json();
    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    const registered = await resolveRegisteredDevice(deviceId);

    if (!registered || !registered.active) {
      return Response.json(
        { success: false, error: "PlayBox tidak ditemukan" },
        { status: 404 },
      );
    }

    if (!canAccessDevice(user.profile, registered)) {
      return Response.json(
        { success: false, error: "Tidak memiliki akses ke PlayBox ini" },
        { status: 403 },
      );
    }

    if (!registered.cafeId) {
      return Response.json(
        { success: false, error: "PlayBox belum memiliki cafeId" },
        { status: 409 },
      );
    }

    const existing = await adminDb
      .collection("preparing_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "PREPARING")
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      const data = doc.data();

      return Response.json({
        success: true,
        preparing: {
          id: doc.id,
          deviceId: data.deviceId,
          status: data.status,
          startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
          activatedAt: null,
          endedAt: null,
          billingSessionId: null,
          operatorUid: data.operatorUid ?? null,
        },
      });
    }

    const ref = adminDb.collection("preparing_sessions").doc();
    const now = Timestamp.now();

    await ref.set({
      deviceId,
      cafeId: registered.cafeId,
      status: "PREPARING",
      startedAt: now,
      activatedAt: null,
      endedAt: null,
      billingSessionId: null,
      operatorUid: user.uid,
      operatorEmail: user.email,
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({
      success: true,
      preparing: {
        id: ref.id,
        deviceId,
        status: "PREPARING",
        startedAt: now.toDate().toISOString(),
        activatedAt: null,
        endedAt: null,
        billingSessionId: null,
        operatorUid: user.uid,
      },
    });
  } catch (error) {
    console.error("START PREPARING ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
