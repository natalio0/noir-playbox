import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessCafe } from "@/lib/session-access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ preparingId: string }> },
) {
  try {
    const user = await requireUserFromRequest(request);
    const { preparingId } = await context.params;
    const ref = adminDb.collection("preparing_sessions").doc(preparingId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return Response.json(
        { success: false, error: "Preparing session tidak ditemukan" },
        { status: 404 },
      );
    }

    const data = snapshot.data()!;

    if (!canAccessCafe(user, data.cafeId)) {
      return Response.json(
        { success: false, error: "Tidak memiliki akses ke preparing session ini" },
        { status: 403 },
      );
    }

    if (data.status !== "PREPARING") {
      return Response.json({ success: true });
    }

    const startedAtMs = data.startedAt?.toDate?.().getTime?.() ?? Date.now();
    const durationMinutes = Math.max(
      0,
      Math.floor((Date.now() - startedAtMs) / 60_000),
    );
    const riskLevel =
      durationMinutes >= 60
        ? "SUSPICIOUS"
        : durationMinutes >= 45
          ? "WARNING"
          : "NORMAL";

    const batch = adminDb.batch();

    batch.update(ref, {
      status: "ENDED_WITHOUT_BILLING",
      endedAt: FieldValue.serverTimestamp(),
      durationMinutes,
      riskLevel,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const auditRef = adminDb.collection("audit_logs").doc();
    batch.set(auditRef, {
      type: "PREPARING_ENDED_WITHOUT_BILLING",
      deviceId: data.deviceId ?? null,
      cafeId: data.cafeId ?? null,
      preparingId,
      operatorUid: data.operatorUid ?? null,
      durationMinutes,
      riskLevel,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return Response.json({ success: true, durationMinutes, riskLevel });
  } catch (error) {
    console.error("END PREPARING ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
