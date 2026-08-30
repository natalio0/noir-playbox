import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebase-admin";

const USERS = [
  {
    email: "admin@noirplaybox.com",
    name: "Admin Noir Playbox",
    role: "admin",
    cafeId: null,
    passwordEnv: "ADMIN_SEED_PASSWORD",
  },
  {
    email: "operational@blacklounge.com",
    name: "Operational Black Lounge",
    role: "operational",
    cafeId: "black-lounge",
    passwordEnv: "OPERATIONAL_SEED_PASSWORD",
  },
] as const;

export async function POST(request: Request) {
  try {
    const seedSecret = process.env.SETUP_SEED_SECRET;

    if (!seedSecret) {
      return Response.json(
        {
          success: false,
          error: "SETUP_SEED_SECRET belum diset",
        },
        { status: 500 },
      );
    }

    const providedSecret = request.headers.get("x-seed-secret");

    if (providedSecret !== seedSecret) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized seed request",
        },
        { status: 401 },
      );
    }

    const results = [];

    for (const config of USERS) {
      const password = process.env[config.passwordEnv];

      if (!password) {
        throw new Error(`${config.passwordEnv} belum diset di .env.local`);
      }

      let firebaseUser;

      try {
        firebaseUser = await adminAuth.getUserByEmail(config.email);

        firebaseUser = await adminAuth.updateUser(firebaseUser.uid, {
          email: config.email,
          password,
          displayName: config.name,
          disabled: false,
        });
      } catch (error: unknown) {
        const errorCode =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: string }).code)
            : "";

        if (errorCode !== "auth/user-not-found") {
          throw error;
        }

        firebaseUser = await adminAuth.createUser({
          email: config.email,
          password,
          displayName: config.name,
          disabled: false,
        });
      }

      await adminDb.collection("users").doc(firebaseUser.uid).set(
        {
          name: config.name,
          email: config.email,
          role: config.role,
          cafeId: config.cafeId,

          authUid: firebaseUser.uid,

          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        },
      );

      results.push({
        uid: firebaseUser.uid,
        email: config.email,
        name: config.name,
        role: config.role,
        cafeId: config.cafeId,
      });
    }

    return Response.json({
      success: true,
      message: "Authentication + Firestore seed berhasil",
      users: results,
    });
  } catch (error) {
    console.error("AUTH USER SEED ERROR:", error);

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Gagal menjalankan seed",
      },
      { status: 500 },
    );
  }
}
