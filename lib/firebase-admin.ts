import fs from "fs";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccountFromEnv(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();

  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  /*
   * Vercel environment variable biasanya menyimpan newline
   * private key sebagai literal "\n".
   *
   * replace(/\\n/g, "\n") mengembalikannya ke format PEM.
   */
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (
    !privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
    !privateKey.includes("-----END PRIVATE KEY-----")
  ) {
    throw new Error(
      "FIREBASE_ADMIN_PRIVATE_KEY tidak valid. Pastikan isi private_key Firebase service account lengkap.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getServiceAccountFromFile(): ServiceAccount | null {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    return null;
  }

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Firebase service account tidak ditemukan: ${credentialsPath}`,
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(credentialsPath, "utf8"),
  ) as ServiceAccount;

  return serviceAccount;
}

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  /*
   * PRIORITAS:
   *
   * 1. Environment variables
   *    -> cocok untuk Vercel / production.
   *
   * 2. GOOGLE_APPLICATION_CREDENTIALS
   *    -> fallback untuk development lokal.
   */
  const serviceAccount =
    getServiceAccountFromEnv() ?? getServiceAccountFromFile();

  if (!serviceAccount) {
    throw new Error(
      [
        "Firebase Admin credentials belum dikonfigurasi.",
        "",
        "Untuk Vercel gunakan:",
        "- FIREBASE_ADMIN_PROJECT_ID",
        "- FIREBASE_ADMIN_CLIENT_EMAIL",
        "- FIREBASE_ADMIN_PRIVATE_KEY",
        "",
        "Untuk local development boleh gunakan:",
        "- GOOGLE_APPLICATION_CREDENTIALS",
      ].join("\n"),
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const adminApp = getFirebaseAdminApp();

export const adminDb = getFirestore(adminApp);

export const adminAuth = getAuth(adminApp);

export default adminApp;
