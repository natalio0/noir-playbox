import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  getMidtransTransactionStatus,
  normalizeMidtransStatus,
  verifyMidtransSignature,
} from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as JsonRecord;

    if (!verifyMidtransSignature(payload)) {
      return Response.json({ success: false, error: "Invalid signature" }, { status: 401 });
    }

    const orderId = String(payload.order_id ?? "").trim();
    if (!orderId) {
      return Response.json({ success: false, error: "order_id missing" }, { status: 400 });
    }

    const ref = adminDb.collection("payment_orders").doc(orderId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      // Return 200 so an old/foreign signed notification does not cause endless retry.
      return Response.json({ success: true, ignored: true });
    }

    // Signature is already valid. GET Status gives us the latest canonical Midtrans state,
    // which also protects against out-of-order webhook delivery.
    let authoritative: JsonRecord = payload;
    try {
      authoritative = await getMidtransTransactionStatus(orderId);
    } catch {
      // Signed payload remains acceptable if GET Status is temporarily unavailable.
    }

    const normalized = normalizeMidtransStatus(authoritative);
    const rawStatus = String(authoritative.transaction_status ?? payload.transaction_status ?? "pending");
    const current = snapshot.data() ?? {};

    const update: Record<string, unknown> = {
      status: normalized,
      midtransTransactionStatus: rawStatus,
      midtransTransactionId:
        authoritative.transaction_id ?? payload.transaction_id ?? current.midtransTransactionId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      lastWebhookAt: FieldValue.serverTimestamp(),
    };

    if (normalized === "PAID" && !current.paidAt) {
      update.paidAt = FieldValue.serverTimestamp();
    }

    await ref.set(update, { merge: true });

    return Response.json({ success: true, orderId, status: normalized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook gagal diproses";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
