/*
 * Test endpoint production/local.
 *
 * Usage:
 * WATCHDOG_URL=http://localhost:3000 \
 * WATCHDOG_SECRET=your_secret \
 * node scripts/test-preparing-watchdog.mjs
 */

const base =
  process.env.WATCHDOG_URL ??
  "http://localhost:3000";

const secret =
  process.env.WATCHDOG_SECRET ??
  process.env.CRON_SECRET;

if (!secret) {
  throw new Error(
    "WATCHDOG_SECRET/CRON_SECRET belum diset",
  );
}

const response = await fetch(
  `${base.replace(/\/+$/, "")}/api/system/preparing-watchdog`,
  {
    headers: {
      Authorization:
        `Bearer ${secret}`,
    },
  },
);

const text =
  await response.text();

console.log(
  response.status,
  text,
);

if (!response.ok) {
  process.exitCode = 1;
}
