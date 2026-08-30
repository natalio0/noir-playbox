"use client";

import { auth } from "@/lib/firebase";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("User belum login");
  }

  const idToken = await user.getIdToken();

  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${idToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
