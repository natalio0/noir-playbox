import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { getMidtransTransactionStatus, normalizeMidtransStatus } from "@/lib/midtrans";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireUserFromRequest(request);
    const { orderId } = await context.params;
    const ref = adminDb.collection("payment_orders").doc(orderId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return Response.json({ success: false, error: "Payment tidak ditemukan" }, { status: 404 });
    }

    const payment = snapshot.data() ?? {};
    const cafeId = typeof payment.cafeId === "string" ? payment.cafeId : null;
    const userCafeId =
      typeof user.profile.cafeId === "string" ? user.profile.cafeId.trim() : null;

    if (user.profile.role === "operational" && (!userCafeId || cafeId !== userCafeId)) {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    let status = String(payment.status ?? "PENDING");
    let midtransTransactionStatus = String(payment.midtransTransactionStatus ?? "pending");

    // Fallback check: if webhook is delayed, ask Midtrans directly while still pending.
    if (status === "PENDING") {
      try {
        const midtrans = await getMidtransTransactionStatus(orderId);
        const normalized = normalizeMidtransStatus(midtrans);
        const rawStatus = String(midtrans.transaction_status ?? "pending");
        status = normalized;
        midtransTransactionStatus = rawStatus;

        const update: Record<string, unknown> = {
          status: normalized,
          midtransTransactionStatus: rawStatus,
          updatedAt: FieldValue.serverTimestamp(),
          lastStatusCheckAt: FieldValue.serverTimestamp(),
        };
        if (normalized === "PAID" && !payment.paidAt) {
          update.paidAt = FieldValue.serverTimestamp();
        }
        if (normalized !== String(payment.status ?? "PENDING") || rawStatus !== String(payment.midtransTransactionStatus ?? "pending")) {
          await ref.update(update);
        }
      } catch {
        // Keep cached status if Midtrans status endpoint is temporarily unavailable.
      }
    }

    return Response.json({
      success: true,
      payment: {
        orderId,
        packageId: payment.packageId ?? null,
        packageName: payment.packageName ?? null,
        durationMinutes: payment.durationMinutes ?? null,
        amount: payment.amount ?? 0,
        status,
        midtransTransactionStatus,
        qrUrl: payment.qrUrl ?? null,
        environment: payment.environment ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengecek payment";
    const unauthorized = message === "UNAUTHORIZED";
    return Response.json(
      { success: false, error: unauthorized ? "Unauthorized" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
