import crypto from "node:crypto";

const ACCESS_ID = process.env.TUYA_ACCESS_ID || "";
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET || "";
const BASE_URL = (
  process.env.TUYA_API_BASE_URL || "https://openapi-sg.iotbing.com"
).replace(/\/$/, "");

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(message: string) {
  return crypto
    .createHmac("sha256", ACCESS_SECRET)
    .update(message, "utf8")
    .digest("hex")
    .toUpperCase();
}

function canonicalPath(path: string) {
  const url = new URL(path, "https://placeholder.local");
  const sorted = [...url.searchParams.entries()].sort(
    ([aKey, aVal], [bKey, bVal]) => {
      const keyCompare = aKey.localeCompare(bKey);
      return keyCompare !== 0 ? keyCompare : aVal.localeCompare(bVal);
    },
  );
  const params = new URLSearchParams();
  sorted.forEach(([key, value]) => params.append(key, value));
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

async function signedRequest<T>(
  method: "GET" | "POST",
  path: string,
  accessToken = "",
  body = "",
): Promise<T> {
  if (!ACCESS_ID || !ACCESS_SECRET) {
    throw new Error("TUYA_ACCESS_ID / TUYA_ACCESS_SECRET belum diset.");
  }

  const t = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const url = canonicalPath(path);
  const contentHash = sha256(body);
  const stringToSign = `${method}\n${contentHash}\n\n${url}`;
  const signPayload = `${ACCESS_ID}${accessToken}${t}${nonce}${stringToSign}`;
  const sign = hmac(signPayload);

  const response = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: {
      client_id: ACCESS_ID,
      sign,
      sign_method: "HMAC-SHA256",
      t,
      nonce,
      ...(accessToken ? { access_token: accessToken } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body || undefined,
    cache: "no-store",
  });

  const json = (await response.json()) as any;
  if (!response.ok || json?.success === false) {
    throw new Error(json?.msg || json?.error || `Tuya HTTP ${response.status}`);
  }
  return json as T;
}

async function getAccessToken() {
  const response = await signedRequest<any>("GET", "/v1.0/token?grant_type=1");
  const token = response?.result?.access_token;
  if (!token) throw new Error("Tuya access token tidak tersedia.");
  return token as string;
}

export type TuyaDeviceDetail = {
  id: string;
  name?: string;
  local_key: string;
  online?: boolean;
  category?: string;
  product_id?: string;
};

export async function getTuyaDeviceDetail(
  deviceId: string,
): Promise<TuyaDeviceDetail> {
  const token = await getAccessToken();
  const encoded = encodeURIComponent(deviceId);

  // Current IoT Core endpoint first; legacy endpoint remains as compatibility fallback.
  const paths = [`/v1.0/iot-03/devices/${encoded}`, `/v1.0/devices/${encoded}`];

  let lastError: unknown;
  for (const path of paths) {
    try {
      const response = await signedRequest<any>("GET", path, token);
      const detail = response?.result;
      if (detail?.id && detail?.local_key) return detail as TuyaDeviceDetail;
      lastError = new Error(
        "Device ditemukan tetapi local_key tidak tersedia.",
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Device Tuya tidak ditemukan.");
}
