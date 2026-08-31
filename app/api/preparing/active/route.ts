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
      .collection("preparing_sessions")
      .where("deviceId", "==", deviceId)
      .where("status", "==", "PREPARING")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return Response.json({ success: true, active: false, preparing: null });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    return Response.json({
      success: true,
      active: true,
      preparing: {
        id: doc.id,
        ...serializePreparing(data),
      },
    });
  } catch (error) {
    console.error("GET ACTIVE PREPARING ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}

function serializePreparing(data: FirebaseFirestore.DocumentData) {
  return {
    deviceId: data.deviceId ?? "",
    status: data.status ?? "PREPARING",
    startedAt: toIso(data.startedAt),
    activatedAt: toIso(data.activatedAt),
    endedAt: toIso(data.endedAt),
    billingSessionId: data.billingSessionId ?? null,
    operatorUid: data.operatorUid ?? null,
  };
}

function toIso(value: unknown) {
  if (!value) return null;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  const date = new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
