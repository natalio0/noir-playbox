import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ preparingId: string }>;
  },
) {
  try {
    await requireUserFromRequest(request);

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

    await ref.update({
      status: "ENDED_WITHOUT_BILLING",
      endedAt: FieldValue.serverTimestamp(),
      durationMinutes,
      riskLevel,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("audit_logs").add({
      type: "PREPARING_ENDED_WITHOUT_BILLING",
      deviceId: data.deviceId ?? null,
      cafeId: data.cafeId ?? null,
      preparingId,
      operatorUid: data.operatorUid ?? null,
      durationMinutes,
      riskLevel,
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({
      success: true,
      durationMinutes,
      riskLevel,
    });
  } catch (error) {
    console.error("END PREPARING ERROR:", error);

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
