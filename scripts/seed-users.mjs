import fs from "fs";
import path from "path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/* =========================================================
   LOAD .env.local TANPA PACKAGE TAMBAHAN
========================================================= */

const envPath = path.resolve(process.cwd(), ".env.local");

if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local tidak ditemukan di root project.");
  process.exit(1);
}

const envText = fs.readFileSync(envPath, "utf8");

for (const rawLine of envText.split(/\r?\n/)) {
  const line = rawLine.trim();

  if (!line || line.startsWith("#")) continue;

  const equalIndex = line.indexOf("=");

  if (equalIndex === -1) continue;

  const key = line.slice(0, equalIndex).trim();
  let value = line.slice(equalIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!process.env[key]) {
    process.env[key] = value;
  }
}

/* =========================================================
   CONFIG
========================================================= */

const USERS = [
  {
    email: "admin@noirplaybox.com",
    passwordEnv: "ADMIN_SEED_PASSWORD",
    name: "Admin Noir Playbox",
    role: "admin",
    cafeId: null,
  },
  {
    email: "operational@blacklounge.com",
    passwordEnv: "OPERATIONAL_SEED_PASSWORD",
    name: "Operational Black Lounge",
    role: "operational",
    cafeId: "black-lounge",
  },
];

/* =========================================================
   FIREBASE ADMIN
========================================================= */

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialsPath) {
  console.error(
    "❌ GOOGLE_APPLICATION_CREDENTIALS belum ada di .env.local",
  );
  process.exit(1);
}

const resolvedCredentialsPath = path.isAbsolute(credentialsPath)
  ? credentialsPath
  : path.resolve(process.cwd(), credentialsPath);

if (!fs.existsSync(resolvedCredentialsPath)) {
  console.error(
    `❌ Service account tidak ditemukan:\n${resolvedCredentialsPath}`,
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(resolvedCredentialsPath, "utf8"),
);

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
      });

const auth = getAuth(app);
const db = getFirestore(app);

/* =========================================================
   CREATE / UPDATE USER
========================================================= */

async function createOrUpdateUser(config) {
  const password = process.env[config.passwordEnv];

  if (!password) {
    throw new Error(
      `${config.passwordEnv} belum ada di .env.local`,
    );
  }

  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(config.email);

    userRecord = await auth.updateUser(userRecord.uid, {
      email: config.email,
      password,
      displayName: config.name,
      disabled: false,
    });

    console.log(`🔄 Auth updated: ${config.email}`);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }

    userRecord = await auth.createUser({
      email: config.email,
      password,
      displayName: config.name,
      disabled: false,
    });

    console.log(`✅ Auth created: ${config.email}`);
  }

  await db
    .collection("users")
    .doc(userRecord.uid)
    .set(
      {
        name: config.name,
        email: config.email,
        role: config.role,
        cafeId: config.cafeId,
        authUid: userRecord.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      },
    );

  console.log(`✅ Firestore profile: users/${userRecord.uid}`);

  return {
    uid: userRecord.uid,
    email: config.email,
    role: config.role,
    cafeId: config.cafeId,
  };
}

/* =========================================================
   RUN
========================================================= */

async function main() {
  console.log("");
  console.log("========================================");
  console.log("🔥 NOIR PLAYBOX USER SEED");
  console.log("========================================");
  console.log("");

  const results = [];

  for (const config of USERS) {
    const result = await createOrUpdateUser(config);
    results.push(result);
    console.log("");
  }

  console.log("========================================");
  console.log("✅ SEED SELESAI");
  console.log("========================================");

  for (const user of results) {
    console.log("");
    console.log(`${user.role.toUpperCase()}`);
    console.log(`Email   : ${user.email}`);
    console.log(`UID     : ${user.uid}`);
    console.log(`Cafe ID : ${user.cafeId ?? "-"}`);
  }

  console.log("");
  console.log(
    "Password mengikuti ADMIN_SEED_PASSWORD dan OPERATIONAL_SEED_PASSWORD di .env.local",
  );
  console.log("");

  process.exit(0);
}

main().catch((error) => {
  console.error("");
  console.error("❌ SEED GAGAL");
  console.error(error);
  process.exit(1);
});
