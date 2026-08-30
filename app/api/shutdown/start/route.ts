import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);

    const body = await request.json();

    const deviceId = String(body.deviceId || "").toUpperCase();

    const sourceSessionId = body.sourceSessionId
      ? String(body.sourceSessionId)
      : null;

    if (!deviceId) {
      return Response.json(
        {
          success: false,
          error: "deviceId wajib diisi",
        },
        { status: 400 },
      );
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
      status: "SHUTDOWN_ACTIVE",
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      sourceSessionId,

      operatorUid: user.uid,
      operatorEmail: user.email,
      cafeId: user.profile?.cafeId ?? null,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const created = await ref.get();

    const data = created.data()!;

    await adminDb.collection("audit_logs").add({
      type: "SHUTDOWN_MODE_STARTED",
      deviceId,
      cafeId: user.profile?.cafeId ?? null,
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

    const message =
      error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      {
        status: message === "UNAUTHORIZED" ? 401 : 500,
      },
    );
  }
}
