import fs from "fs";

import { cert, getApps, getApp, initializeApp } from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

import { getFirestore } from "firebase-admin/firestore";

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS belum diset");
  }

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Firebase service account tidak ditemukan: ${credentialsPath}`,
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const adminApp = getFirebaseAdminApp();

export const adminDb = getFirestore(adminApp);

export const adminAuth = getAuth(adminApp);

export default adminApp;
