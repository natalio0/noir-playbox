type DashboardUser = {
  profile?: Record<string, unknown> | null;
};

export function canAccessSession(
  user: DashboardUser,
  sessionData: Record<string, unknown>,
) {
  const role = typeof user.profile?.role === "string" ? user.profile.role : "";

  if (role === "admin") {
    return true;
  }

  if (role !== "operational") {
    return false;
  }

  const userCafeId =
    typeof user.profile?.cafeId === "string" ? user.profile.cafeId : null;
  const sessionCafeId =
    typeof sessionData.cafeId === "string" ? sessionData.cafeId : null;

  return Boolean(userCafeId && sessionCafeId && userCafeId === sessionCafeId);
}

export function canAccessCafe(
  user: DashboardUser,
  cafeId: unknown,
) {
  const role = typeof user.profile?.role === "string" ? user.profile.role : "";

  if (role === "admin") {
    return true;
  }

  return (
    role === "operational" &&
    typeof user.profile?.cafeId === "string" &&
    typeof cafeId === "string" &&
    user.profile.cafeId === cafeId
  );
}
