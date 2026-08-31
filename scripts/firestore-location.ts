import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const { default: adminApp } = await import("../lib/firebase-admin");

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (!projectId) {
    throw new Error("Project ID Firebase tidak ditemukan di environment.");
  }

  const credential = adminApp.options.credential;

  if (!credential) {
    throw new Error("Firebase Admin credential tidak tersedia.");
  }

  const token = await credential.getAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`,
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    },
  );

  const data = (await response.json()) as {
    name?: string;
    locationId?: string;
    type?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  console.log(`Firebase project: ${projectId}`);
  console.log(`Firestore location: ${data.locationId ?? "unknown"}`);
  console.log(`Firestore type: ${data.type ?? "unknown"}`);
}

main().catch((error) => {
  console.error(
    "FIRESTORE LOCATION CHECK FAILED:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
