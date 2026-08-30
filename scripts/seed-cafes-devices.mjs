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

const envPath =
  path.resolve(
    process.cwd(),
    ".env.local",
  );

const envText =
  fs.readFileSync(
    envPath,
    "utf8",
  );

for (
  const rawLine of
  envText.split(/\r?\n/)
) {
  const line =
    rawLine.trim();

  if (
    !line ||
    line.startsWith("#")
  ) {
    continue;
  }

  const index =
    line.indexOf("=");

  if (index === -1) {
    continue;
  }

  const key =
    line
      .slice(0, index)
      .trim();

  let value =
    line
      .slice(index + 1)
      .trim();

  if (
    (value.startsWith('"') &&
      value.endsWith('"')) ||
    (value.startsWith("'") &&
      value.endsWith("'"))
  ) {
    value =
      value.slice(1, -1);
  }

  process.env[key] ??= value;
}

const credentialsPath =
  process.env
    .GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialsPath) {
  throw new Error(
    "GOOGLE_APPLICATION_CREDENTIALS belum diset",
  );
}

const resolved =
  path.isAbsolute(
    credentialsPath,
  )
    ? credentialsPath
    : path.resolve(
        process.cwd(),
        credentialsPath,
      );

const serviceAccount =
  JSON.parse(
    fs.readFileSync(
      resolved,
      "utf8",
    ),
  );

const app =
  getApps().length
    ? getApps()[0]
    : initializeApp({
        credential:
          cert(
            serviceAccount,
          ),
      });

const db =
  getFirestore(app);

async function main() {
  const batch =
    db.batch();

  const cafeRef =
    db.collection("cafes")
      .doc("black-lounge");

  batch.set(
    cafeRef,
    {
      name:
        "Black Lounge Cafe",

      active: true,

      revenueShareNoir:
        70,

      revenueShareCafe:
        30,

      updatedAt:
        FieldValue
          .serverTimestamp(),
    },
    { merge: true },
  );

  for (
    let index = 1;
    index <= 5;
    index += 1
  ) {
    const deviceId =
      `PS${String(index).padStart(2, "0")}`;

    const ref =
      db.collection("devices")
        .doc(deviceId);

    batch.set(
      ref,
      {
        deviceId,

        cafeId:
          "black-lounge",

        name:
          `Black Lounge ${deviceId}`,

        active: true,

        updatedAt:
          FieldValue
            .serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();

  console.log(
    "✅ Cafe + device seed selesai",
  );

  console.log(
    "Black Lounge Cafe → PS01-PS05",
  );
}

main()
  .then(() =>
    process.exit(0),
  )
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
