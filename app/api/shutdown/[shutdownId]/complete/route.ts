import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ shutdownId: string }>;
  },
) {
  try {
    await requireUserFromRequest(request);

    const { shutdownId } = await context.params;

    const ref = adminDb.collection("shutdown_sessions").doc(shutdownId);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return Response.json(
        {
          success: false,
          error: "Shutdown session tidak ditemukan",
        },
        { status: 404 },
      );
    }

    const data = snapshot.data()!;

    if (data.status !== "SHUTDOWN_ACTIVE") {
      return Response.json({
        success: true,
      });
    }

    const startedAtMs = data.startedAt?.toDate?.().getTime?.() ?? Date.now();

    const durationMinutes = Math.max(
      0,
      Math.floor((Date.now() - startedAtMs) / 60_000),
    );

    await ref.update({
      status: "SHUTDOWN_COMPLETED",
      endedAt: FieldValue.serverTimestamp(),
      durationMinutes,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("audit_logs").add({
      type: "SHUTDOWN_MODE_COMPLETED",
      deviceId: data.deviceId ?? null,
      cafeId: data.cafeId ?? null,
      shutdownId,
      sourceSessionId: data.sourceSessionId ?? null,
      operatorUid: data.operatorUid ?? null,
      durationMinutes,
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      success: true,
      durationMinutes,
    });
  } catch (error) {
    console.error("COMPLETE SHUTDOWN ERROR:", error);

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
