import { createHash } from "crypto";

import { adminAuth, adminDb } from "@/lib/firebase-admin";

export type DashboardUserProfile = Record<string, unknown> & {
  role: "admin" | "operational";
  cafeId: string | null;
};

export type DashboardUser = {
  uid: string;
  email: string | null;
  profile: DashboardUserProfile;
};

type CachedDashboardUser = {
  expiresAt: number;
  value: DashboardUser;
};

/*
 * Cache sangat pendek untuk rangkaian action operator yang sama.
 * Vercel function yang warm dapat melewati verify token + Firestore users/{uid}
 * berulang kali, tetapi perubahan role/cafe tetap maksimal tertunda 30 detik.
 */
const AUTH_CACHE_MS = 30_000;
const AUTH_CACHE_MAX = 200;
const verifiedUserCache = new Map<string, CachedDashboardUser>();

function tokenCacheKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function pruneAuthCache(now: number) {
  for (const [key, cached] of verifiedUserCache) {
    if (cached.expiresAt <= now) {
      verifiedUserCache.delete(key);
    }
  }

  while (verifiedUserCache.size >= AUTH_CACHE_MAX) {
    const oldestKey = verifiedUserCache.keys().next().value as string | undefined;

    if (!oldestKey) {
      break;
    }

    verifiedUserCache.delete(oldestKey);
  }
}

export function invalidateDashboardUserCache() {
  verifiedUserCache.clear();
}

export async function requireUserFromRequest(request: Request): Promise<DashboardUser> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  const now = Date.now();
  const cacheKey = tokenCacheKey(token);
  const cached = verifiedUserCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached) {
    verifiedUserCache.delete(cacheKey);
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

  const profile: DashboardUserProfile = {
    ...data,
    role: data.role as "admin" | "operational",
    cafeId:
      typeof data.cafeId === "string" && data.cafeId.trim()
        ? data.cafeId
        : null,
  };

  const value: DashboardUser = {
    uid: decoded.uid,
    email: decoded.email ?? null,
    profile,
  };

  const tokenExpiryMs = Number(decoded.exp ?? 0) * 1000;
  const cacheExpiry = Math.min(
    now + AUTH_CACHE_MS,
    tokenExpiryMs > now ? tokenExpiryMs : now + AUTH_CACHE_MS,
  );

  pruneAuthCache(now);
  verifiedUserCache.set(cacheKey, {
    expiresAt: cacheExpiry,
    value,
  });

  return value;
}
