import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessCafe, canAccessSession } from "@/lib/session-access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ preparingId: string }> },
) {
  try {
    const user = await requireUserFromRequest(request);
    const { preparingId } = await context.params;
    const body = await request.json();
    const billingSessionId = String(body.billingSessionId ?? "").trim();

    if (!billingSessionId) {
      return Response.json(
        { success: false, error: "billingSessionId wajib diisi" },
        { status: 400 },
      );
    }

    const ref = adminDb.collection("preparing_sessions").doc(preparingId);
    const billingRef = adminDb.collection("sessions").doc(billingSessionId);

    const [snapshot, billingSnapshot] = await Promise.all([
      ref.get(),
      billingRef.get(),
    ]);

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
      return Response.json(
        { success: false, error: "Preparing session sudah ditutup" },
        { status: 409 },
      );
    }

    if (!billingSnapshot.exists) {
      return Response.json(
        { success: false, error: "Billing session tidak ditemukan" },
        { status: 404 },
      );
    }

    const billingData = billingSnapshot.data()!;

    if (
      !canAccessSession(user, billingData) ||
      billingData.status !== "ACTIVE" ||
      String(billingData.deviceId ?? "").toUpperCase() !==
        String(data.deviceId ?? "").toUpperCase() ||
      billingData.cafeId !== data.cafeId
    ) {
      return Response.json(
        { success: false, error: "Billing session tidak sesuai dengan PREPARING" },
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
    const message = error instanceof Error ? error.message : "Internal server error";

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
