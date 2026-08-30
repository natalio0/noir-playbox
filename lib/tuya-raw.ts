import crypto from "crypto";

let cachedToken: {
  token: string;
  expiresAt: number;
} | null = null;

function getConfig() {
  const clientId =
    process.env.TUYA_ACCESS_ID ??
    process.env.TUYA_CLIENT_ID ??
    process.env.TUYA_CLIENT_KEY;

  const clientSecret =
    process.env.TUYA_ACCESS_SECRET ??
    process.env.TUYA_CLIENT_SECRET ??
    process.env.TUYA_CLIENT_KEY_SECRET;

  const endpoint =
    process.env.TUYA_ENDPOINT ??
    process.env.TUYA_API_ENDPOINT ??
    process.env.TUYA_BASE_URL;

  if (!clientId) {
    throw new Error(
      "TUYA_ACCESS_ID / TUYA_CLIENT_ID belum diset",
    );
  }

  if (!clientSecret) {
    throw new Error(
      "TUYA_ACCESS_SECRET / TUYA_CLIENT_SECRET belum diset",
    );
  }

  if (!endpoint) {
    throw new Error(
      "TUYA_ENDPOINT belum diset di .env.local",
    );
  }

  return {
    clientId,
    clientSecret,
    endpoint: endpoint.replace(/\/+$/, ""),
  };
}

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function hmac(
  secret: string,
  value: string,
) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex")
    .toUpperCase();
}

function stringToSign(
  method: string,
  path: string,
  body = "",
) {
  return [
    method.toUpperCase(),
    sha256(body),
    "",
    path,
  ].join("\n");
}

async function getAccessToken() {
  if (
    cachedToken &&
    cachedToken.expiresAt >
      Date.now() + 60_000
  ) {
    return cachedToken.token;
  }

  const {
    clientId,
    clientSecret,
    endpoint,
  } = getConfig();

  const path =
    "/v1.0/token?grant_type=1";

  const t = Date.now().toString();

  const sign = hmac(
    clientSecret,
    clientId +
      t +
      stringToSign(
        "GET",
        path,
      ),
  );

  const response = await fetch(
    endpoint + path,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        client_id: clientId,
        sign,
        t,
        sign_method:
          "HMAC-SHA256",
      },
    },
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.success ||
    !data?.result?.access_token
  ) {
    throw new Error(
      String(
        data?.msg ??
          data?.message ??
          "Gagal mengambil Tuya access token",
      ),
    );
  }

  const expireSeconds =
    Number(
      data.result.expire_time ??
        7200,
    );

  cachedToken = {
    token:
      data.result.access_token,
    expiresAt:
      Date.now() +
      expireSeconds * 1000,
  };

  return cachedToken.token;
}

export async function getRawTuyaDevice(
  tuyaDeviceId: string,
) {
  const {
    clientId,
    clientSecret,
    endpoint,
  } = getConfig();

  const accessToken =
    await getAccessToken();

  const normalized =
    tuyaDeviceId.trim();

  if (!normalized) {
    throw new Error(
      "Tuya Device ID kosong",
    );
  }

  const path =
    `/v1.0/devices/${encodeURIComponent(normalized)}`;

  const t =
    Date.now().toString();

  const sign =
    hmac(
      clientSecret,
      clientId +
        accessToken +
        t +
        stringToSign(
          "GET",
          path,
        ),
    );

  const response =
    await fetch(
      endpoint + path,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          client_id:
            clientId,
          access_token:
            accessToken,
          sign,
          t,
          sign_method:
            "HMAC-SHA256",
        },
      },
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.success ||
    !data?.result
  ) {
    throw new Error(
      String(
        data?.msg ??
          data?.message ??
          "Device tidak ditemukan di Tuya",
      ),
    );
  }

  return {
    id:
      String(
        data.result.id ??
          normalized,
      ),
    name:
      String(
        data.result.name ??
          "Tuya Device",
      ),
    online:
      Boolean(
        data.result.online,
      ),
    category:
      data.result.category
        ? String(
            data.result.category,
          )
        : null,
    productId:
      data.result.product_id
        ? String(
            data.result.product_id,
          )
        : null,
    raw: data.result,
  };
}
