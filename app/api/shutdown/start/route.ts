import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessSession } from "@/lib/session-access";

function serializeShutdown(
  id: string,
  data: FirebaseFirestore.DocumentData,
) {
  return {
    id,
    deviceId: data.deviceId ?? "",
    status: data.status ?? "SHUTDOWN_ACTIVE",
    startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
    endedAt: data.endedAt?.toDate?.().toISOString?.() ?? null,
    operatorUid: data.operatorUid ?? null,
    sourceSessionId: data.sourceSessionId ?? null,
  };
}

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

    const [activeSnapshot, pendingSnapshot] = await Promise.all([
      adminDb
        .collection("shutdown_sessions")
        .where("deviceId", "==", deviceId)
        .where("status", "==", "SHUTDOWN_ACTIVE")
        .limit(1)
        .get(),
      adminDb
        .collection("shutdown_sessions")
        .where("deviceId", "==", deviceId)
        .where("status", "==", "SHUTDOWN_PENDING")
        .limit(1)
        .get(),
    ]);

    if (!activeSnapshot.empty) {
      const doc = activeSnapshot.docs[0];
      return Response.json({
        success: true,
        shutdown: serializeShutdown(doc.id, doc.data()),
      });
    }

    const now = Timestamp.now();

    if (!pendingSnapshot.empty) {
      const doc = pendingSnapshot.docs[0];
      const ref = doc.ref;

      await ref.update({
        status: "SHUTDOWN_ACTIVE",
        startedAt: now,
        endedAt: null,
        operatorUid: user.uid,
        operatorEmail: user.email ?? null,
        updatedAt: now,
      });

      const data: FirebaseFirestore.DocumentData = {
        ...doc.data(),
        status: "SHUTDOWN_ACTIVE",
        startedAt: now,
        endedAt: null,
        operatorUid: user.uid,
      };

      await adminDb.collection("audit_logs").add({
        type: "SHUTDOWN_MODE_STARTED",
        deviceId,
        cafeId: registered.cafeId,
        shutdownId: ref.id,
        sourceSessionId: data.sourceSessionId ?? null,
        operatorUid: user.uid,
        createdAt: now,
      });

      return Response.json({
        success: true,
        shutdown: serializeShutdown(ref.id, data),
      });
    }

    /*
     * Backward compatibility: bila client masih membawa ID rental yang baru
     * selesai tetapi PENDING belum pernah dibuat oleh versi lama, buat ACTIVE
     * dari source session tersebut tanpa membuat billing baru.
     */
    if (!sourceSessionId) {
      return Response.json(
        {
          success: false,
          error: "Tidak ada shutdown pending untuk PlayBox ini",
        },
        { status: 409 },
      );
    }

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

    if (sourceData.status !== "COMPLETED") {
      return Response.json(
        { success: false, error: "Rental belum selesai" },
        { status: 409 },
      );
    }

    const ref = adminDb
      .collection("shutdown_sessions")
      .doc(`session-${sourceSessionId}`);

    const data = {
      deviceId,
      cafeId: registered.cafeId,
      status: "SHUTDOWN_ACTIVE",
      pendingAt: now,
      startedAt: now,
      endedAt: null,
      sourceSessionId,
      operatorUid: user.uid,
      operatorEmail: user.email ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(data, { merge: true });

    await adminDb.collection("audit_logs").add({
      type: "SHUTDOWN_MODE_STARTED",
      deviceId,
      cafeId: registered.cafeId,
      shutdownId: ref.id,
      sourceSessionId,
      operatorUid: user.uid,
      createdAt: now,
    });

    return Response.json({
      success: true,
      shutdown: serializeShutdown(ref.id, data),
    });
  } catch (error) {
    console.error("START SHUTDOWN ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
