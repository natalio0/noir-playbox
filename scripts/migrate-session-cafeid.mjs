import fs from "fs";
import path from "path";

import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

/* =========================================================
   LOAD .env.local
========================================================= */

const envPath = path.resolve(
  process.cwd(),
  ".env.local",
);

if (!fs.existsSync(envPath)) {
  console.error(
    "❌ .env.local tidak ditemukan di root project.",
  );

  process.exit(1);
}

const envText =
  fs.readFileSync(envPath, "utf8");

for (const rawLine of envText.split(/\r?\n/)) {
  const line = rawLine.trim();

  if (!line || line.startsWith("#")) {
    continue;
  }

  const equalIndex = line.indexOf("=");

  if (equalIndex === -1) {
    continue;
  }

  const key = line
    .slice(0, equalIndex)
    .trim();

  let value = line
    .slice(equalIndex + 1)
    .trim();

  if (
    (value.startsWith('"') &&
      value.endsWith('"')) ||
    (value.startsWith("'") &&
      value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!process.env[key]) {
    process.env[key] = value;
  }
}

/* =========================================================
   FIREBASE ADMIN
========================================================= */

const credentialsPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialsPath) {
  console.error(
    "❌ GOOGLE_APPLICATION_CREDENTIALS belum ada di .env.local",
  );

  process.exit(1);
}

const resolvedCredentialsPath =
  path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(
        process.cwd(),
        credentialsPath,
      );

if (
  !fs.existsSync(
    resolvedCredentialsPath,
  )
) {
  console.error(
    `❌ Service account tidak ditemukan:\n${resolvedCredentialsPath}`,
  );

  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(
    resolvedCredentialsPath,
    "utf8",
  ),
);

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(
          serviceAccount,
        ),
      });

const db = getFirestore(app);

/* =========================================================
   MIGRATION
========================================================= */

const BLACK_LOUNGE_DEVICES =
  new Set([
    "PS01",
    "PS02",
    "PS03",
    "PS04",
    "PS05",
  ]);

async function main() {
  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "🔥 NOIR PLAYBOX CAFE ID MIGRATION",
  );
  console.log(
    "========================================",
  );
  console.log("");

  const snapshot = await db
    .collection("sessions")
    .get();

  let checked = 0;
  let migrated = 0;
  let skipped = 0;

  const candidates = [];

  for (const doc of snapshot.docs) {
    checked += 1;

    const data = doc.data();

    const deviceId = String(
      data.deviceId ?? "",
    ).toUpperCase();

    /*
     * Jangan menimpa data yang
     * sudah punya cafeId.
     */

    if (
      typeof data.cafeId === "string" &&
      data.cafeId.trim()
    ) {
      skipped += 1;
      continue;
    }

    if (
      !BLACK_LOUNGE_DEVICES.has(
        deviceId,
      )
    ) {
      skipped += 1;
      continue;
    }

    candidates.push({
      ref: doc.ref,
      id: doc.id,
      deviceId,
    });
  }

  if (!candidates.length) {
    console.log(
      "✅ Tidak ada session lama yang perlu dimigrasi.",
    );

    console.log("");
    console.log(
      `Checked : ${checked}`,
    );
    console.log(
      `Migrated: 0`,
    );
    console.log(
      `Skipped : ${skipped}`,
    );

    process.exit(0);
  }

  /*
   * Firestore batch maksimal 500 writes.
   * Kita pakai chunk 400 supaya aman.
   */

  const chunkSize = 400;

  for (
    let start = 0;
    start < candidates.length;
    start += chunkSize
  ) {
    const chunk = candidates.slice(
      start,
      start + chunkSize,
    );

    const batch = db.batch();

    for (const session of chunk) {
      batch.update(
        session.ref,
        {
          cafeId:
            "black-lounge",

          cafeIdMigratedAt:
            FieldValue
              .serverTimestamp(),
        },
      );

      console.log(
        `→ ${session.id} (${session.deviceId}) => black-lounge`,
      );
    }

    await batch.commit();

    migrated += chunk.length;
  }

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "✅ MIGRATION SELESAI",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Checked : ${checked}`,
  );
  console.log(
    `Migrated: ${migrated}`,
  );
  console.log(
    `Skipped : ${skipped}`,
  );
  console.log("");

  process.exit(0);
}

main().catch((error) => {
  console.error("");
  console.error(
    "❌ MIGRATION GAGAL",
  );
  console.error(error);

  process.exit(1);
});
