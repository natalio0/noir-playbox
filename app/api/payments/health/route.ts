import { isMidtransProduction } from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    success: true,
    configured: Boolean(process.env.MIDTRANS_SERVER_KEY?.trim()),
    environment: isMidtransProduction() ? "production" : "sandbox",
  });
}
