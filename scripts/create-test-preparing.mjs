/*
Usage:

BASE_URL=http://localhost:3000 \
FIREBASE_ID_TOKEN="paste-admin-id-token" \
DEVICE_ID=PS01 \
MINUTES_AGO=61 \
node scripts/create-test-preparing.mjs
*/

const baseUrl =
  process.env.BASE_URL ??
  "http://localhost:3000";

const token =
  process.env.FIREBASE_ID_TOKEN;

const deviceId =
  process.env.DEVICE_ID ??
  "PS01";

const minutesAgo =
  Number(process.env.MINUTES_AGO ?? 61);

if (!token) {
  throw new Error(
    "FIREBASE_ID_TOKEN wajib diisi",
  );
}

const response = await fetch(
  `${baseUrl.replace(/\/+$/, "")}/api/dev/test-preparing`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId,
      minutesAgo,
    }),
  },
);

const text = await response.text();

console.log(
  response.status,
  text,
);

if (!response.ok) {
  process.exitCode = 1;
}
