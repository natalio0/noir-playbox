import { createHash, timingSafeEqual } from "crypto";

export type MidtransStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "FAILED"
  | "REFUNDED";

type JsonRecord = Record<string, unknown>;

function requireServerKey() {
  const key = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi");
  return key;
}

export function isMidtransProduction() {
  return process.env.MIDTRANS_IS_PRODUCTION?.trim().toLowerCase() === "true";
}

export function midtransBaseUrl() {
  return isMidtransProduction()
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

function authHeader() {
  const encoded = Buffer.from(`${requireServerKey()}:`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

async function midtransRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${midtransBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const raw = await response.text();
  let data: JsonRecord = {};
  try {
    data = raw ? (JSON.parse(raw) as JsonRecord) : {};
  } catch {
    data = { status_message: raw };
  }

  if (!response.ok) {
    const message =
      typeof data.status_message === "string"
        ? data.status_message
        : `Midtrans HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function createQrisCharge(input: {
  orderId: string;
  amount: number;
  itemId: string;
  itemName: string;
}) {
  const data = await midtransRequest("/v2/charge", {
    method: "POST",
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.amount,
      },
      item_details: [
        {
          id: input.itemId,
          price: input.amount,
          quantity: 1,
          name: input.itemName.slice(0, 50),
        },
      ],
      qris: { acquirer: "gopay" },
    }),
  });

  const actions = Array.isArray(data.actions) ? data.actions : [];
  const qrAction = actions.find((action) => {
    if (!action || typeof action !== "object") return false;
    const name = (action as JsonRecord).name;
    return name === "generate-qr-code-v2" || name === "generate-qr-code";
  }) as JsonRecord | undefined;

  const qrUrl = typeof qrAction?.url === "string" ? qrAction.url : null;
  if (!qrUrl) throw new Error("QRIS URL tidak ditemukan pada respons Midtrans");

  return {
    raw: data,
    qrUrl,
    transactionId:
      typeof data.transaction_id === "string" ? data.transaction_id : null,
    transactionStatus:
      typeof data.transaction_status === "string"
        ? data.transaction_status
        : "pending",
  };
}

export async function getMidtransTransactionStatus(orderId: string) {
  return midtransRequest(`/v2/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
  });
}

export function normalizeMidtransStatus(data: JsonRecord): MidtransStatus {
  const status = String(data.transaction_status ?? "").toLowerCase();
  const fraud = String(data.fraud_status ?? "accept").toLowerCase();

  if ((status === "settlement" || status === "capture") && fraud === "accept") {
    return "PAID";
  }
  if (status === "refund" || status === "partial_refund") return "REFUNDED";
  if (status === "expire") return "EXPIRED";
  if (["deny", "cancel", "failure"].includes(status)) return "FAILED";
  return "PENDING";
}

export function verifyMidtransSignature(payload: JsonRecord) {
  const orderId = String(payload.order_id ?? "");
  const statusCode = String(payload.status_code ?? "");
  const grossAmount = String(payload.gross_amount ?? "");
  const signature = String(payload.signature_key ?? "").toLowerCase();
  if (!orderId || !statusCode || !grossAmount || !signature) return false;

  const expected = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${requireServerKey()}`)
    .digest("hex")
    .toLowerCase();

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
