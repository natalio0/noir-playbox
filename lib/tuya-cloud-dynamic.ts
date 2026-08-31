import crypto from "crypto";

let tokenCache: { token: string; expiresAt: number } | null = null;

function getConfig() {
  const clientId =
    process.env.TUYA_ACCESS_ID ??
    process.env.TUYA_CLIENT_ID ??
    process.env.TUYA_CLIENT_KEY;

  const secret =
    process.env.TUYA_ACCESS_SECRET ??
    process.env.TUYA_CLIENT_SECRET ??
    process.env.TUYA_CLIENT_KEY_SECRET;

  const endpoint =
    process.env.TUYA_API_BASE_URL ??
    process.env.TUYA_ENDPOINT ??
    process.env.TUYA_API_ENDPOINT ??
    process.env.TUYA_BASE_URL;

  if (!clientId) throw new Error("Tuya Client ID belum diset");
  if (!secret) throw new Error("Tuya Client Secret belum diset");
  if (!endpoint) throw new Error("Tuya API endpoint belum diset");

  return { clientId, secret, endpoint: endpoint.replace(/\/+$/, "") };
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hmac(secret: string, input: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex").toUpperCase();
}

function stringToSign(method: string, path: string, body: string) {
  return [method.toUpperCase(), sha256(body), "", path].join("\n");
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const { clientId, secret, endpoint } = getConfig();
  const path = "/v1.0/token?grant_type=1";
  const t = Date.now().toString();
  const sign = hmac(secret, clientId + t + stringToSign("GET", path, ""));

  const response = await fetch(endpoint + path, {
    cache: "no-store",
    headers: { client_id: clientId, sign, t, sign_method: "HMAC-SHA256" },
  });

  const data = await response.json();
  if (!response.ok || data?.success !== true || !data?.result?.access_token) {
    throw new Error(String(data?.msg ?? data?.message ?? "Gagal membuat token Tuya"));
  }

  tokenCache = {
    token: data.result.access_token,
    expiresAt: Date.now() + Number(data.result.expire_time ?? 7200) * 1000,
  };
  return tokenCache.token;
}

async function requestTuya(method: "GET" | "POST", path: string, bodyObject?: unknown) {
  const { clientId, secret, endpoint } = getConfig();
  const token = await getAccessToken();
  const body = bodyObject === undefined ? "" : JSON.stringify(bodyObject);
  const t = Date.now().toString();
  const sign = hmac(secret, clientId + token + t + stringToSign(method, path, body));

  const response = await fetch(endpoint + path, {
    method,
    cache: "no-store",
    headers: {
      client_id: clientId,
      access_token: token,
      sign,
      t,
      sign_method: "HMAC-SHA256",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });

  const data = await response.json();
  if (!response.ok || data?.success !== true) {
    const code = data?.code !== undefined ? ` [${String(data.code)}]` : "";
    throw new Error(`${String(data?.msg ?? data?.message ?? "Tuya request gagal")}${code}`);
  }
  return data.result;
}

export type DynamicDeviceState = {
  switch: boolean;
  countdown: number;
  power: number;
  current: number;
  voltage: number;
  rawProperties?: Record<string, unknown>;
};

export async function getDynamicTuyaState(rawDeviceId: string): Promise<DynamicDeviceState> {
  const path = `/v2.0/cloud/thing/${encodeURIComponent(rawDeviceId)}/shadow/properties`;
  const result = await requestTuya("GET", path);
  const props = normalizeProperties(result);

  return {
    switch: pickBool(props, ["switch_1", "switch"]),
    countdown: pickNumber(props, ["countdown_1", "countdown"]),
    power: pickNumber(props, ["cur_power", "power"]),
    current: pickNumber(props, ["cur_current", "current"]),
    voltage: pickNumber(props, ["cur_voltage", "voltage"]),
    rawProperties: props,
  };
}

type TuyaStateCacheEntry = {
  state: DynamicDeviceState | null;
  expiresAt: number;
  inFlight: Promise<DynamicDeviceState> | null;
};

const tuyaStateCache = new Map<string, TuyaStateCacheEntry>();

/**
 * Short server-side cache only for monitoring reads. Control routes still call
 * Tuya directly, so ON/OFF/TIMER commands are never delayed by this cache.
 */
export async function getCachedDynamicTuyaState(
  rawDeviceId: string,
  ttlMs = 3000,
): Promise<DynamicDeviceState> {
  const key = rawDeviceId.trim();
  const now = Date.now();
  const cached = tuyaStateCache.get(key);

  if (cached?.state && cached.expiresAt > now) {
    return cached.state;
  }

  if (cached?.inFlight) {
    return cached.inFlight;
  }

  const inFlight = getDynamicTuyaState(key);

  tuyaStateCache.set(key, {
    state: cached?.state ?? null,
    expiresAt: cached?.expiresAt ?? 0,
    inFlight,
  });

  try {
    const state = await inFlight;

    tuyaStateCache.set(key, {
      state,
      expiresAt: Date.now() + Math.max(0, ttlMs),
      inFlight: null,
    });

    return state;
  } catch (error) {
    tuyaStateCache.delete(key);
    throw error;
  }
}

export type TuyaStandardCommand = { code: string; value: unknown };

export async function sendTuyaStandardCommands(
  rawDeviceId: string,
  commands: TuyaStandardCommand[],
) {
  if (!commands.length) throw new Error("Commands Tuya kosong");
  const path = `/v1.0/iot-03/devices/${encodeURIComponent(rawDeviceId)}/commands`;
  return requestTuya("POST", path, { commands });
}

export async function issueDynamicTuyaProperties(
  rawDeviceId: string,
  properties: Record<string, unknown>,
) {
  return sendTuyaStandardCommands(
    rawDeviceId,
    Object.entries(properties).map(([code, value]) => ({ code, value })),
  );
}

function normalizeProperties(result: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!result) return out;
  if (Array.isArray(result)) {
    appendArray(out, result);
    return out;
  }
  if (typeof result !== "object") return out;

  const obj = result as Record<string, unknown>;
  const raw = obj.properties;

  if (Array.isArray(raw)) {
    appendArray(out, raw);
    return out;
  }
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = unwrap(v);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) out[k] = unwrap(v);
  return out;
}

function appendArray(out: Record<string, unknown>, items: unknown[]) {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const code =
      typeof obj.code === "string" ? obj.code :
      typeof obj.dp_code === "string" ? obj.dp_code :
      typeof obj.property_code === "string" ? obj.property_code : null;
    if (!code) continue;
    out[code] = unwrap(obj.value ?? obj.property_value ?? obj.dp_value);
  }
}

function unwrap(value: unknown) {
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

function pickNumber(values: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = values[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

function pickBool(values: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = values[key];
    if (typeof v === "boolean") return v;
    if (v === "true" || v === 1 || v === "1") return true;
    if (v === "false" || v === 0 || v === "0") return false;
  }
  return false;
}
