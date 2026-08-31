"use client";

import type { User } from "firebase/auth";

import type { UserProfile } from "@/lib/auth";

type CachedProfile = {
  uid: string;
  profile: UserProfile;
  expiresAt: number;
};

const PROFILE_CACHE_MS = 60_000;

let cachedProfile: CachedProfile | null = null;
let inFlight:
  | {
      uid: string;
      promise: Promise<UserProfile>;
    }
  | null = null;

export async function getAuthenticatedProfile(
  user: User,
  options?: { force?: boolean },
): Promise<UserProfile> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (
    !force &&
    cachedProfile &&
    cachedProfile.uid === user.uid &&
    cachedProfile.expiresAt > now
  ) {
    return cachedProfile.profile;
  }

  if (inFlight?.uid === user.uid) {
    return inFlight.promise;
  }

  const promise = (async () => {
    const idToken = await user.getIdToken();

    const response = await fetch("/api/auth/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.profile) {
      throw new Error(
        data.error || "Profile user belum dikonfigurasi.",
      );
    }

    const profile = data.profile as UserProfile;

    cachedProfile = {
      uid: user.uid,
      profile,
      expiresAt: Date.now() + PROFILE_CACHE_MS,
    };

    return profile;
  })();

  inFlight = {
    uid: user.uid,
    promise,
  };

  try {
    return await promise;
  } finally {
    if (inFlight?.promise === promise) {
      inFlight = null;
    }
  }
}

export function clearAuthenticatedProfileCache() {
  cachedProfile = null;
  inFlight = null;
}
