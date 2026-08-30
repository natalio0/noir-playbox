import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function requireUserFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.slice("Bearer ".length);

  const decoded = await adminAuth.verifyIdToken(token);

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

  const profile = userDoc.exists ? userDoc.data() : null;

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    profile,
  };
}
