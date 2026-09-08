import {
  getMidtransTransactionStatus,
  isMidtransProduction,
  normalizeMidtransStatus,
} from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    if (isMidtransProduction()) {
      return Response.json(
        { success: false, error: "Sandbox test endpoint nonaktif di production Midtrans" },
        { status: 404 },
      );
    }

    const { orderId } = await context.params;
    if (!orderId?.trim()) {
      return Response.json({ success: false, error: "orderId wajib diisi" }, { status: 400 });
    }

    const midtrans = await getMidtransTransactionStatus(orderId.trim());

    return Response.json(
      {
        success: true,
        environment: "sandbox",
        payment: {
          orderId: String(midtrans.order_id ?? orderId),
          status: normalizeMidtransStatus(midtrans),
          midtransTransactionStatus: String(midtrans.transaction_status ?? "pending"),
          fraudStatus: midtrans.fraud_status ?? null,
          grossAmount: midtrans.gross_amount ?? null,
          transactionId: midtrans.transaction_id ?? null,
          transactionTime: midtrans.transaction_time ?? null,
          settlementTime: midtrans.settlement_time ?? null,
          expiryTime: midtrans.expiry_time ?? null,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengecek QRIS Sandbox";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
