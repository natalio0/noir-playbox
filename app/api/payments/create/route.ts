import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { createQrisCharge, isMidtransProduction } from "@/lib/midtrans";
import { getPaymentPackage } from "@/lib/payment-packages";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as { packageId?: unknown };
    const packageId = typeof body.packageId === "string" ? body.packageId : "";
    const rentalPackage = getPaymentPackage(packageId);

    if (!rentalPackage) {
      return Response.json({ success: false, error: "Paket tidak valid" }, { status: 400 });
    }

    const cafeId =
      typeof user.profile.cafeId === "string" && user.profile.cafeId.trim()
        ? user.profile.cafeId.trim()
        : null;

    if (user.profile.role === "operational" && !cafeId) {
      return Response.json({ success: false, error: "Operator belum memiliki cafeId" }, { status: 403 });
    }

    const orderId = `NP-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const charge = await createQrisCharge({
      orderId,
      amount: rentalPackage.price,
      itemId: rentalPackage.id,
      itemName: `Noir Playbox ${rentalPackage.label}`,
    });

    await adminDb.collection("payment_orders").doc(orderId).set({
      orderId,
      cafeId,
      createdByUid: user.uid,
      createdByEmail: user.email,
      packageId: rentalPackage.id,
      packageName: rentalPackage.label,
      durationMinutes: rentalPackage.durationMinutes,
      amount: rentalPackage.price,
      status: "PENDING",
      midtransTransactionId: charge.transactionId,
      midtransTransactionStatus: charge.transactionStatus,
      qrUrl: charge.qrUrl,
      environment: isMidtransProduction() ? "production" : "sandbox",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      paidAt: null,
    });

    return Response.json({
      success: true,
      payment: {
        orderId,
        packageId: rentalPackage.id,
        packageName: rentalPackage.label,
        durationMinutes: rentalPackage.durationMinutes,
        amount: rentalPackage.price,
        status: "PENDING",
        qrUrl: charge.qrUrl,
        environment: isMidtransProduction() ? "production" : "sandbox",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat QRIS";
    const unauthorized = message === "UNAUTHORIZED";
    return Response.json(
      { success: false, error: unauthorized ? "Unauthorized" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
