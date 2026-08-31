import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

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

    const snapshot = await adminDb
      .collection("shutdown_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "SHUTDOWN_ACTIVE")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return Response.json({ success: true, active: false, shutdown: null });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    return Response.json({
      success: true,
      active: true,
      shutdown: {
        id: doc.id,
        deviceId: data.deviceId ?? "",
        status: data.status ?? "SHUTDOWN_ACTIVE",
        startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
        endedAt: data.endedAt?.toDate?.().toISOString?.() ?? null,
        operatorUid: data.operatorUid ?? null,
        sourceSessionId: data.sourceSessionId ?? null,
      },
    });
  } catch (error) {
    console.error("GET ACTIVE SHUTDOWN ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
