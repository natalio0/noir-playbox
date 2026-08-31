import { Timestamp } from "firebase-admin/firestore";

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
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "COMPLETE").toUpperCase();

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

    if (action === "SKIP_REUSE") {
      if (data.status === "SHUTDOWN_SKIPPED_REUSED") {
        return Response.json({ success: true, skipped: true });
      }

      if (data.status !== "SHUTDOWN_PENDING") {
        return Response.json(
          { success: false, error: "Shutdown pending sudah tidak tersedia" },
          { status: 409 },
        );
      }

      const now = Timestamp.now();
      const batch = adminDb.batch();

      batch.update(ref, {
        status: "SHUTDOWN_SKIPPED_REUSED",
        endedAt: now,
        updatedAt: now,
      });

      const auditRef = adminDb.collection("audit_logs").doc();
      batch.set(auditRef, {
        type: "SHUTDOWN_PENDING_SKIPPED_REUSED",
        deviceId: data.deviceId ?? null,
        cafeId: data.cafeId ?? null,
        shutdownId,
        sourceSessionId: data.sourceSessionId ?? null,
        operatorUid: user.uid,
        createdAt: now,
      });

      await batch.commit();

      return Response.json({ success: true, skipped: true });
    }

    if (data.status === "SHUTDOWN_COMPLETED") {
      return Response.json({ success: true, durationMinutes: data.durationMinutes ?? 0 });
    }

    if (data.status !== "SHUTDOWN_ACTIVE") {
      return Response.json(
        { success: false, error: "Shutdown Mode belum aktif" },
        { status: 409 },
      );
    }

    const startedAtMs = data.startedAt?.toDate?.().getTime?.() ?? Date.now();
    const durationMinutes = Math.max(
      0,
      Math.floor((Date.now() - startedAtMs) / 60_000),
    );
    const now = Timestamp.now();
    const batch = adminDb.batch();

    batch.update(ref, {
      status: "SHUTDOWN_COMPLETED",
      endedAt: now,
      durationMinutes,
      updatedAt: now,
    });

    const auditRef = adminDb.collection("audit_logs").doc();
    batch.set(auditRef, {
      type: "SHUTDOWN_MODE_COMPLETED",
      deviceId: data.deviceId ?? null,
      cafeId: data.cafeId ?? null,
      shutdownId,
      sourceSessionId: data.sourceSessionId ?? null,
      operatorUid: user.uid,
      durationMinutes,
      createdAt: now,
    });

    await batch.commit();

    return Response.json({ success: true, durationMinutes });
  } catch (error) {
    console.error("COMPLETE SHUTDOWN ERROR:", error);
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
