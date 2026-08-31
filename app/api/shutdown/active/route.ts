import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { deviceRuntimeRef, parseDeviceRuntime } from "@/lib/device-runtime";

function serializeShutdown(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();

  return {
    id: doc.id,
    deviceId: data.deviceId ?? "",
    status: data.status ?? "SHUTDOWN_PENDING",
    startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
    endedAt: data.endedAt?.toDate?.().toISOString?.() ?? null,
    operatorUid: data.operatorUid ?? null,
    sourceSessionId: data.sourceSessionId ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const deviceId = String(searchParams.get("deviceId") ?? "")
      .trim()
      .toUpperCase();

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    const [registered, runtimeSnapshot] = await Promise.all([
      resolveRegisteredDevice(deviceId),
      deviceRuntimeRef(deviceId).get(),
    ]);

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

    const runtime = parseDeviceRuntime(deviceId, runtimeSnapshot.data());

    if (runtime) {
      if (!runtime.shutdownId || !runtime.shutdownStatus) {
        return Response.json({ success: true, active: false, shutdown: null });
      }

      return Response.json({
        success: true,
        active: true,
        shutdown: {
          id: runtime.shutdownId,
          deviceId,
          status: runtime.shutdownStatus,
          startedAt:
            runtime.shutdownStartedAt?.toDate?.().toISOString?.() ?? null,
          endedAt: null,
          operatorUid: null,
          sourceSessionId: runtime.sourceSessionId,
        },
      });
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

    const doc = !activeSnapshot.empty
      ? activeSnapshot.docs[0]
      : !pendingSnapshot.empty
        ? pendingSnapshot.docs[0]
        : null;

    if (!doc) {
      return Response.json({ success: true, active: false, shutdown: null });
    }

    return Response.json({
      success: true,
      active: true,
      shutdown: serializeShutdown(doc),
    });
  } catch (error) {
    console.error("GET ACTIVE SHUTDOWN ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
