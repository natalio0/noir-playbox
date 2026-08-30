import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const vercelPath = path.join(
  root,
  "vercel.json",
);

const WATCHDOG_PATH =
  "/api/system/preparing-watchdog";

const WATCHDOG_SCHEDULE =
  "*/5 * * * *";

let config = {};

if (fs.existsSync(vercelPath)) {
  try {
    config = JSON.parse(
      fs.readFileSync(
        vercelPath,
        "utf8",
      ),
    );
  } catch (error) {
    console.error(
      "❌ vercel.json ada tetapi JSON-nya tidak valid.",
    );
    console.error(error);
    process.exit(1);
  }
}

const existingCrons =
  Array.isArray(config.crons)
    ? config.crons
    : [];

const otherCrons =
  existingCrons.filter(
    (cron) =>
      cron?.path !==
      WATCHDOG_PATH,
  );

config.crons = [
  ...otherCrons,
  {
    path: WATCHDOG_PATH,
    schedule: WATCHDOG_SCHEDULE,
  },
];

fs.writeFileSync(
  vercelPath,
  `${JSON.stringify(
    config,
    null,
    2,
  )}\n`,
);

console.log(
  "✅ Vercel watchdog cron terpasang.",
);
console.log(
  `   Path     : ${WATCHDOG_PATH}`,
);
console.log(
  `   Schedule : ${WATCHDOG_SCHEDULE}`,
);
console.log(
  `   File     : ${vercelPath}`,
);
console.log("");
console.log(
  "Catatan: jadwal */5 berarti watchdog dipanggil setiap 5 menit.",
);
console.log(
  "PREPARING threshold tetap >=60 menit, sehingga real-world shutdown biasanya sekitar menit 60–65.",
);
