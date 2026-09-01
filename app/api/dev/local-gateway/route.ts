import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LocalGatewayAction = "status" | "on" | "off";

type LocalGatewayBody = {
  deviceId?: unknown;
  action?: unknown;
};

function unavailableInProduction() {
  return NextResponse.json(
    {
      success: false,
      error: "Local gateway pilot is available only in local development.",
    },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function normalizeGatewayUrl() {
  const raw =
    process.env.NOIR_LOCAL_GATEWAY_URL?.trim() || "http://127.0.0.1:8787";

  return raw.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return unavailableInProduction();
  }

  let body: LocalGatewayBody;

  try {
    body = (await request.json()) as LocalGatewayBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Request JSON tidak valid." },
      { status: 400 },
    );
  }

  const deviceId =
    typeof body.deviceId === "string" ? body.deviceId.trim().toUpperCase() : "";
  const action =
    typeof body.action === "string"
      ? (body.action.trim().toLowerCase() as LocalGatewayAction)
      : "";

  if (!/^PS\d{2,3}$/.test(deviceId)) {
    return NextResponse.json(
      { success: false, error: "deviceId harus seperti PS01." },
      { status: 400 },
    );
  }

  if (!["status", "on", "off"].includes(action)) {
    return NextResponse.json(
      { success: false, error: "action harus status, on, atau off." },
      { status: 400 },
    );
  }

  const gatewayUrl = normalizeGatewayUrl();
  const gatewayToken = process.env.NOIR_LOCAL_GATEWAY_TOKEN?.trim() || "";

  const target =
    action === "status"
      ? `${gatewayUrl}/status/${encodeURIComponent(deviceId)}`
      : `${gatewayUrl}/control/${encodeURIComponent(deviceId)}/${action}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(target, {
      method: action === "status" ? "GET" : "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: gatewayToken
        ? {
            "X-Gateway-Token": gatewayToken,
          }
        : undefined,
    });

    const raw = await response.text();
    let gatewayBody: unknown;

    try {
      gatewayBody = raw ? JSON.parse(raw) : null;
    } catch {
      gatewayBody = { raw };
    }

    return NextResponse.json(
      {
        success: response.ok,
        transport: "LOCAL_TINYTUYA",
        gatewayStatus: response.status,
        result: gatewayBody,
      },
      {
        status: response.ok ? 200 : 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Local gateway timeout setelah 5 detik."
        : error instanceof Error
          ? error.message
          : "Tidak dapat menghubungi local gateway.";

    return NextResponse.json(
      {
        success: false,
        transport: "LOCAL_TINYTUYA",
        error: message,
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } finally {
    clearTimeout(timer);
  }
}
