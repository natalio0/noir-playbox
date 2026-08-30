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
    const body = await request.json();

    const billingSessionId = String(body.billingSessionId || "");

    if (!billingSessionId) {
      return Response.json(
        { success: false, error: "billingSessionId wajib diisi" },
        { status: 400 },
      );
    }

    const ref = adminDb.collection("preparing_sessions").doc(preparingId);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return Response.json(
        { success: false, error: "Preparing session tidak ditemukan" },
        { status: 404 },
      );
    }

    if (snapshot.data()?.status !== "PREPARING") {
      return Response.json(
        { success: false, error: "Preparing session sudah ditutup" },
        { status: 409 },
      );
    }

    await ref.update({
      status: "CONVERTED_TO_BILLING",
      billingSessionId,
      activatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("ACTIVATE PREPARING ERROR:", error);

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
