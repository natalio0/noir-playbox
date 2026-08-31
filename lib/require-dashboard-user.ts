import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function requireUserFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const decoded = await adminAuth.verifyIdToken(token);
  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

  if (!userDoc.exists) {
    throw new Error("UNAUTHORIZED");
  }

  const data = userDoc.data();

  if (!data || (data.role !== "admin" && data.role !== "operational")) {
    throw new Error("UNAUTHORIZED");
  }

  const profile = {
    ...data,
    role: data.role as "admin" | "operational",
    cafeId:
      typeof data.cafeId === "string" && data.cafeId.trim()
        ? data.cafeId
        : null,
  };

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    profile,
  };
}
