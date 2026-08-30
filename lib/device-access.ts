import { adminDb } from "@/lib/firebase-admin";

import type { UserProfile } from "@/lib/auth";

export async function canAccessDevice(
  user: UserProfile,
  deviceId: string,
): Promise<boolean> {
  /* ==========================================
     ADMIN
  ========================================== */

  if (user.role === "admin") {
    return true;
  }

  /* ==========================================
     OPERATIONAL HARUS PUNYA CAFE
  ========================================== */

  if (user.role === "operational" && !user.cafeId) {
    return false;
  }

  /* ==========================================
     GET DEVICE
  ========================================== */

  const deviceSnapshot = await adminDb
    .collection("devices")
    .doc(deviceId)
    .get();

  if (!deviceSnapshot.exists) {
    return false;
  }

  const device = deviceSnapshot.data();

  if (!device) {
    return false;
  }

  /* ==========================================
     CHECK CAFE
  ========================================== */

  return device.cafeId === user.cafeId;
}
