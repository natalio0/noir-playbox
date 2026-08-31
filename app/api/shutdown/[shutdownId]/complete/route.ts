import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessCafe } from "@/lib/session-access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ shutdownId: string }> },
) {
  try {
    const user = await requireUserFromRequest(request);
    const { shutdownId } = await context.params;
    const ref = adminDb.collection("shutdown_sessions").doc(shutdownId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return Response.json(
        { success: false, error: "Shutdown session tidak ditemukan" },
        { status: 404 },
      );
    }

    const data = snapshot.data()!;

    if (!canAccessCafe(user, data.cafeId)) {
      return Response.json(
        { success: false, error: "Tidak memiliki akses ke shutdown session ini" },
        { status: 403 },
      );
    }

    if (data.status !== "SHUTDOWN_ACTIVE") {
      return Response.json({ success: true });
    }

    const startedAtMs = data.startedAt?.toDate?.().getTime?.() ?? Date.now();
    const durationMinutes = Math.max(
      0,
      Math.floor((Date.now() - startedAtMs) / 60_000),
    );

    const batch = adminDb.batch();

    batch.update(ref, {
      status: "SHUTDOWN_COMPLETED",
      endedAt: FieldValue.serverTimestamp(),
      durationMinutes,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const auditRef = adminDb.collection("audit_logs").doc();
    batch.set(auditRef, {
      type: "SHUTDOWN_MODE_COMPLETED",
      deviceId: data.deviceId ?? null,
      cafeId: data.cafeId ?? null,
      shutdownId,
      sourceSessionId: data.sourceSessionId ?? null,
      operatorUid: data.operatorUid ?? null,
      durationMinutes,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return Response.json({ success: true, durationMinutes });
  } catch (error) {
    console.error("COMPLETE SHUTDOWN ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
