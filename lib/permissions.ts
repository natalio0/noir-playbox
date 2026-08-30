import type { UserProfile, UserRole } from "@/lib/server-auth";

/* =========================================================
   CHECK ROLE
========================================================= */

export function hasRole(profile: UserProfile | null, role: UserRole) {
  if (!profile) {
    return false;
  }

  return profile.role === role;
}

/* =========================================================
   ADMIN
========================================================= */

export function isAdmin(profile: UserProfile | null) {
  return profile?.role === "admin";
}

/* =========================================================
   OPERATIONAL
========================================================= */

export function isOperational(profile: UserProfile | null) {
  return profile?.role === "operational";
}

/* =========================================================
   CAFE ACCESS
========================================================= */

export function canAccessCafe(profile: UserProfile | null, cafeId: string) {
  if (!profile) {
    return false;
  }

  /* ADMIN */

  if (profile.role === "admin") {
    return true;
  }

  /* OPERATIONAL */

  if (profile.role === "operational") {
    return profile.cafeId === cafeId;
  }

  return false;
}
