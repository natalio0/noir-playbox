import CryptoJS from "crypto-js";

const ACCESS_ID = process.env.TUYA_ACCESS_ID!;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET!;

const BASE_URL =
  process.env.TUYA_API_BASE_URL || "https://openapi-sg.iot-03.com";

/* =========================================================
   TUYA ERROR
========================================================= */

export class TuyaDeviceOfflineError extends Error {
  code = "DEVICE_OFFLINE";
  tuyaCode = 40000801;

  constructor() {
    super("Device sedang offline");
    this.name = "TuyaDeviceOfflineError";
  }
}

/* =========================================================
   HASH
========================================================= */

function sha256(body: string) {
  return CryptoJS.SHA256(body).toString(CryptoJS.enc.Hex);
}

function hmacSha256(message: string) {
  return CryptoJS.HmacSHA256(message, ACCESS_SECRET).toString(CryptoJS.enc.Hex);
}

/* =========================================================
   GET TOKEN
========================================================= */

async function getToken() {
  const timestamp = Date.now().toString();

  const contentHash = sha256("");

  const stringToSign = [
    "GET",
    contentHash,
    "",
    "/v1.0/token?grant_type=1",
  ].join("\n");

  const signStr = ACCESS_ID + timestamp + stringToSign;

  const sign = hmacSha256(signStr).toUpperCase();

  const response = await fetch(`${BASE_URL}/v1.0/token?grant_type=1`, {
    method: "GET",

    headers: {
      client_id: ACCESS_ID,
      t: timestamp,
      sign_method: "HMAC-SHA256",
      sign,
    },

    cache: "no-store",
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Tuya token error: ${JSON.stringify(data)}`);
  }

  return data.result.access_token;
}

/* =========================================================
   GET RAW DEVICE STATUS
========================================================= */

export async function getTuyaDeviceStatus(deviceId: string) {
  const token = await getToken();

  const timestamp = Date.now().toString();

  const path = `/v1.0/devices/${deviceId}/status`;

  const contentHash = sha256("");

  const stringToSign = ["GET", contentHash, "", path].join("\n");

  const signStr = ACCESS_ID + token + timestamp + stringToSign;

  const sign = hmacSha256(signStr).toUpperCase();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",

    headers: {
      client_id: ACCESS_ID,
      access_token: token,
      t: timestamp,
      sign_method: "HMAC-SHA256",
      sign,
    },

    cache: "no-store",
  });

  const data = await response.json();

  /* =====================================================
     DEVICE OFFLINE
  ===================================================== */

  if (data?.success === false && Number(data?.code) === 40000801) {
    throw new TuyaDeviceOfflineError();
  }

  /* =====================================================
     OTHER TUYA ERROR
  ===================================================== */

  if (!data.success) {
    throw new Error(`Tuya device error: ${JSON.stringify(data)}`);
  }

  return data.result;
}

/* =========================================================
   DEVICE STATE
========================================================= */

export type TuyaDeviceState = {
  switch: boolean;
  countdown: number;
  power: number;
  current: number;
  voltage: number;
};

/* =========================================================
   GET NORMALIZED STATE
========================================================= */

export async function getTuyaDeviceState(
  deviceId: string,
): Promise<TuyaDeviceState> {
  const status = await getTuyaDeviceStatus(deviceId);

  const getValue = (code: string) =>
    status.find((item: { code: string; value: unknown }) => item.code === code)
      ?.value;

  return {
    switch: getValue("switch_1") === true,

    countdown: Number(getValue("countdown_1") ?? 0),

    power: Number(getValue("cur_power") ?? 0),

    current: Number(getValue("cur_current") ?? 0),

    voltage: Number(getValue("cur_voltage") ?? 0),
  };
}

/* =========================================================
   TUYA COMMAND
========================================================= */

export type TuyaCommand = {
  code: string;
  value: boolean | number;
};

/* =========================================================
   TUYA PROPERTY
========================================================= */

export type TuyaProperty = {
  code: string;
  value: boolean | number | string;
};

/* =========================================================
   SEND PROPERTIES
========================================================= */

export async function sendTuyaProperties(
  deviceId: string,
  properties: Record<string, boolean | number | string>,
) {
  const token = await getToken();

  const timestamp = Date.now().toString();

  const path = `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`;

  const body = JSON.stringify({
    properties: JSON.stringify(properties),
  });

  const contentHash = sha256(body);

  const stringToSign = ["POST", contentHash, "", path].join("\n");

  const signStr = ACCESS_ID + token + timestamp + stringToSign;

  const sign = hmacSha256(signStr).toUpperCase();

  console.log("TUYA ISSUE REQUEST:", {
    deviceId,
    path,
    body,
  });

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",

    headers: {
      client_id: ACCESS_ID,
      access_token: token,
      t: timestamp,
      sign_method: "HMAC-SHA256",
      sign,
      "Content-Type": "application/json",
    },

    body,

    cache: "no-store",
  });

  const data = await response.json();

  console.log("TUYA ISSUE RESPONSE:", data);

  /* =====================================================
     DEVICE OFFLINE
  ===================================================== */

  if (data?.success === false && Number(data?.code) === 40000801) {
    throw new TuyaDeviceOfflineError();
  }

  /* =====================================================
     OTHER ERROR
  ===================================================== */

  if (!data.success) {
    throw new Error(`Tuya property error: ${JSON.stringify(data)}`);
  }

  return data.result;
}
