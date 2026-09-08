import { randomUUID } from "crypto";

import { createQrisCharge, isMidtransProduction } from "@/lib/midtrans";
import { getPaymentPackage } from "@/lib/payment-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (isMidtransProduction()) {
      return Response.json(
        { success: false, error: "Sandbox test endpoint nonaktif di production Midtrans" },
        { status: 404 },
      );
    }

    const body = (await request.json()) as { packageId?: unknown };
    const packageId = typeof body.packageId === "string" ? body.packageId : "";
    const rentalPackage = getPaymentPackage(packageId);

    if (!rentalPackage) {
      return Response.json(
        { success: false, error: "Paket tidak valid" },
        { status: 400 },
      );
    }

    const orderId = `NP-SBX-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const charge = await createQrisCharge({
      orderId,
      amount: rentalPackage.price,
      itemId: rentalPackage.id,
      itemName: `Noir Playbox ${rentalPackage.label}`,
    });

    return Response.json(
      {
        success: true,
        environment: "sandbox",
        persisted: false,
        payment: {
          orderId,
          packageId: rentalPackage.id,
          packageName: rentalPackage.label,
          durationMinutes: rentalPackage.durationMinutes,
          amount: rentalPackage.price,
          status: "PENDING",
          midtransTransactionStatus: charge.transactionStatus,
          transactionId: charge.transactionId,
          qrUrl: charge.qrUrl,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat QRIS Sandbox";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
