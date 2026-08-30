"use client";

import { auth } from "@/lib/firebase";

export type PreparingSession = {
  id: string;
  deviceId: string;
  status: "PREPARING" | "CONVERTED_TO_BILLING" | "ENDED_WITHOUT_BILLING";
  startedAt: string | null;
  activatedAt: string | null;
  endedAt: string | null;
  billingSessionId: string | null;
  operatorUid: string | null;
};

export type ShutdownSession = {
  id: string;
  deviceId: string;
  status: "SHUTDOWN_ACTIVE" | "SHUTDOWN_COMPLETED";
  startedAt: string | null;
  endedAt: string | null;
  operatorUid: string | null;
  sourceSessionId: string | null;
};

async function getIdToken() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("User belum login");
  }

  return user.getIdToken();
}

/* =========================================================
   PREPARING
========================================================= */

export async function getActivePreparingSession(
  deviceId: string,
): Promise<PreparingSession | null> {
  const idToken = await getIdToken();

  const response = await fetch(
    `/api/preparing/active?deviceId=${encodeURIComponent(deviceId)}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal mengambil preparing session");
  }

  return data.active ? (data.preparing as PreparingSession) : null;
}

export async function startPreparingSession(
  deviceId: string,
): Promise<PreparingSession> {
  const idToken = await getIdToken();

  const response = await fetch("/api/preparing/start", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ deviceId }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal membuat preparing session");
  }

  return data.preparing as PreparingSession;
}

export async function convertPreparingToBilling(
  preparingId: string,
  billingSessionId: string,
): Promise<void> {
  const idToken = await getIdToken();

  const response = await fetch(`/api/preparing/${preparingId}/activate`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ billingSessionId }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal mengaktifkan billing");
  }
}

export async function endPreparingWithoutBilling(
  preparingId: string,
): Promise<void> {
  const idToken = await getIdToken();

  const response = await fetch(`/api/preparing/${preparingId}/end`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal menutup preparing session");
  }
}

export function getPreparingRisk(startedAt: string | null, nowMs = Date.now()) {
  if (!startedAt) {
    return {
      elapsedMinutes: 0,
      level: "NORMAL" as const,
    };
  }

  const startedMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedMs)) {
    return {
      elapsedMinutes: 0,
      level: "NORMAL" as const,
    };
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - startedMs) / 60_000));

  if (elapsedMinutes >= 60) {
    return {
      elapsedMinutes,
      level: "SUSPICIOUS" as const,
    };
  }

  if (elapsedMinutes >= 45) {
    return {
      elapsedMinutes,
      level: "WARNING" as const,
    };
  }

  return {
    elapsedMinutes,
    level: "NORMAL" as const,
  };
}

/* =========================================================
   SHUTDOWN MODE
========================================================= */

export async function getActiveShutdownSession(
  deviceId: string,
): Promise<ShutdownSession | null> {
  const idToken = await getIdToken();

  const response = await fetch(
    `/api/shutdown/active?deviceId=${encodeURIComponent(deviceId)}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal mengambil shutdown mode");
  }

  return data.active ? (data.shutdown as ShutdownSession) : null;
}

export async function startShutdownMode(
  deviceId: string,
  sourceSessionId?: string | null,
): Promise<ShutdownSession> {
  const idToken = await getIdToken();

  const response = await fetch("/api/shutdown/start", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      deviceId,
      sourceSessionId: sourceSessionId ?? null,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal memulai shutdown mode");
  }

  return data.shutdown as ShutdownSession;
}

export async function completeShutdownMode(shutdownId: string): Promise<void> {
  const idToken = await getIdToken();

  const response = await fetch(`/api/shutdown/${shutdownId}/complete`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Gagal menyelesaikan shutdown mode");
  }
}

export function getShutdownElapsedMinutes(
  startedAt: string | null,
  nowMs = Date.now(),
) {
  if (!startedAt) {
    return 0;
  }

  const startedMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((nowMs - startedMs) / 60_000));
}
