import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessSession } from "@/lib/session-access";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json();
    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();
    const sourceSessionId = body.sourceSessionId
      ? String(body.sourceSessionId).trim()
      : null;

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

    if (sourceSessionId) {
      const sourceSession = await adminDb
        .collection("sessions")
        .doc(sourceSessionId)
        .get();

      if (!sourceSession.exists) {
        return Response.json(
          { success: false, error: "Source session tidak ditemukan" },
          { status: 404 },
        );
      }

      const sourceData = sourceSession.data()!;

      if (
        !canAccessSession(user, sourceData) ||
        String(sourceData.deviceId ?? "").toUpperCase() !== deviceId
      ) {
        return Response.json(
          { success: false, error: "Source session tidak sesuai dengan PlayBox" },
          { status: 403 },
        );
      }
    }

    const existing = await adminDb
      .collection("shutdown_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "SHUTDOWN_ACTIVE")
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      const data = doc.data();

      return Response.json({
        success: true,
        shutdown: {
          id: doc.id,
          deviceId: data.deviceId,
          status: data.status,
          startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
          endedAt: null,
          operatorUid: data.operatorUid ?? null,
          sourceSessionId: data.sourceSessionId ?? null,
        },
      });
    }

    const ref = adminDb.collection("shutdown_sessions").doc();

    await ref.set({
      deviceId,
      cafeId: registered.cafeId,
      status: "SHUTDOWN_ACTIVE",
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      sourceSessionId,
      operatorUid: user.uid,
      operatorEmail: user.email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const created = await ref.get();
    const data = created.data()!;

    await adminDb.collection("audit_logs").add({
      type: "SHUTDOWN_MODE_STARTED",
      deviceId,
      cafeId: registered.cafeId,
      shutdownId: ref.id,
      sourceSessionId,
      operatorUid: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      success: true,
      shutdown: {
        id: ref.id,
        deviceId,
        status: "SHUTDOWN_ACTIVE",
        startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
        endedAt: null,
        operatorUid: user.uid,
        sourceSessionId,
      },
    });
  } catch (error) {
    console.error("START SHUTDOWN ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
