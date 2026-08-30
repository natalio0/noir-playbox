import { adminDb, adminAuth } from "@/lib/firebase-admin";

/* =========================================================
   USER ROLE
========================================================= */

export type UserRole = "admin" | "operational";

/* =========================================================
   USER PROFILE
========================================================= */

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  cafeId: string | null;
};

/* =========================================================
   GET AUTHENTICATED USER
========================================================= */

export async function getAuthenticatedUser(
  request: Request,
): Promise<UserProfile | null> {
  try {
    /* =====================================================
       GET AUTHORIZATION HEADER
    ===================================================== */

    const authorization = request.headers.get("authorization");

    if (!authorization) {
      console.error("AUTH ERROR: Authorization header tidak ada");
      return null;
    }

    if (!authorization.startsWith("Bearer ")) {
      console.error("AUTH ERROR: Authorization bukan Bearer token");
      return null;
    }

    const idToken = authorization.substring("Bearer ".length).trim();

    if (!idToken) {
      console.error("AUTH ERROR: ID token kosong");
      return null;
    }

    /* =====================================================
       VERIFY FIREBASE TOKEN
    ===================================================== */

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    console.log("=================================");
    console.log("🔥 AUTHENTICATED USER");
    console.log("UID:", decodedToken.uid);
    console.log("EMAIL:", decodedToken.email);
    console.log("=================================");

    /* =====================================================
       GET USER PROFILE FROM FIRESTORE
       
       users/{uid}
    ===================================================== */

    const userRef = adminDb.collection("users").doc(decodedToken.uid);

    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      console.error(
        "AUTH ERROR: User profile tidak ditemukan:",
        decodedToken.uid,
      );

      return null;
    }

    const data = userSnapshot.data();

    if (!data) {
      console.error("AUTH ERROR: User profile kosong");

      return null;
    }

    /* =====================================================
       VALIDATE ROLE
    ===================================================== */

    if (data.role !== "admin" && data.role !== "operational") {
      console.error("AUTH ERROR: Role tidak valid:", data.role);

      return null;
    }

    /* =====================================================
       CREATE USER PROFILE
    ===================================================== */

    const user: UserProfile = {
      uid: decodedToken.uid,

      name: String(data.name ?? ""),

      email: String(data.email ?? decodedToken.email ?? ""),

      role: data.role,

      cafeId:
        data.cafeId !== undefined &&
        data.cafeId !== null &&
        String(data.cafeId).trim() !== ""
          ? String(data.cafeId)
          : null,
    };

    /* =====================================================
       DEBUG
    ===================================================== */

    console.log("=================================");
    console.log("🔥 USER PROFILE");
    console.log("UID:", user.uid);
    console.log("NAME:", user.name);
    console.log("EMAIL:", user.email);
    console.log("ROLE:", user.role);
    console.log("CAFE ID:", user.cafeId);
    console.log("=================================");

    return user;
  } catch (error) {
    console.error("=================================");
    console.error("🔥 GET AUTHENTICATED USER ERROR");
    console.error(error);
    console.error("=================================");

    return null;
  }
}

/* =========================================================
   GET USER PROFILE
========================================================= */

export async function getServerUserProfile(
  uid: string,
): Promise<UserProfile | null> {
  const userRef = adminDb.collection("users").doc(uid);

  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();

  if (!data) {
    return null;
  }

  if (data.role !== "admin" && data.role !== "operational") {
    return null;
  }

  return {
    uid,

    name: String(data.name ?? ""),

    email: String(data.email ?? ""),

    role: data.role,

    cafeId:
      data.cafeId !== undefined && data.cafeId !== null
        ? String(data.cafeId)
        : null,
  };
}
