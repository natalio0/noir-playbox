import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const vercelPath = path.join(root, "vercel.json");

const WATCHDOG_PATH = "/api/system/preparing-watchdog";

if (!fs.existsSync(vercelPath)) {
  console.log("ℹ️ vercel.json belum ada. Tidak ada cron yang perlu dihapus.");
  process.exit(0);
}

let config;

try {
  config = JSON.parse(
    fs.readFileSync(vercelPath, "utf8"),
  );
} catch (error) {
  console.error("❌ vercel.json tidak valid JSON.");
  console.error(error);
  process.exit(1);
}

if (!Array.isArray(config.crons)) {
  console.log("ℹ️ vercel.json tidak memiliki crons.");
  process.exit(0);
}

const before = config.crons.length;

config.crons = config.crons.filter(
  (cron) => cron?.path !== WATCHDOG_PATH,
);

const after = config.crons.length;

if (config.crons.length === 0) {
  delete config.crons;
}

fs.writeFileSync(
  vercelPath,
  `${JSON.stringify(config, null, 2)}\n`,
);

console.log("✅ Vercel watchdog cron dihapus dari vercel.json.");
console.log(`   Sebelum : ${before}`);
console.log(`   Sesudah : ${after}`);
console.log("");
console.log("Endpoint watchdog tetap tersedia:");
console.log(`   ${WATCHDOG_PATH}`);
console.log("");
console.log("Gunakan external scheduler untuk memanggil endpoint tersebut.");
