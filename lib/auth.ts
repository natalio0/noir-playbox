import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export type UserRole = "admin" | "operational";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  cafeId: string | null;
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, "users", uid);

  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  if (data.role !== "admin" && data.role !== "operational") {
    return null;
  }

  return {
    uid,
    name: data.name ?? "",
    email: data.email ?? "",
    role: data.role,
    cafeId: data.cafeId ?? null,
  };
}
