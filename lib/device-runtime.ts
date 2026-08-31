import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

export const DEVICE_RUNTIME_SCHEMA_VERSION = 1;

export type RuntimeShutdownStatus =
  | "SHUTDOWN_PENDING"
  | "SHUTDOWN_ACTIVE"
  | null;

export type DeviceRuntimeData = {
  schemaVersion: number;
  deviceId: string;
  cafeId: string | null;

  preparingId: string | null;
  preparingStartedAt: FirebaseFirestore.Timestamp | null;

  activeSessionId: string | null;
  sessionStartedAt: FirebaseFirestore.Timestamp | null;
  sessionTotalMinutes: number;
  sessionTotalPrice: number;

  shutdownId: string | null;
  shutdownStatus: RuntimeShutdownStatus;
  shutdownStartedAt: FirebaseFirestore.Timestamp | null;
  sourceSessionId: string | null;

  lastCompletedSessionId: string | null;
  lastCompletedStartedAt: FirebaseFirestore.Timestamp | null;
  lastCompletedEndedAt: FirebaseFirestore.Timestamp | null;
  lastCompletedTotalMinutes: number;
  lastCompletedTotalPrice: number;

  createdAt?: FirebaseFirestore.Timestamp | null;
  updatedAt?: FirebaseFirestore.Timestamp | null;
};

export function normalizeRuntimeDeviceId(deviceId: string) {
  return String(deviceId ?? "").trim().toUpperCase();
}

export function deviceRuntimeRef(deviceId: string) {
  return adminDb
    .collection("device_runtime")
    .doc(normalizeRuntimeDeviceId(deviceId));
}

function asTimestamp(value: unknown): FirebaseFirestore.Timestamp | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return value as FirebaseFirestore.Timestamp;
  }

  return null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseDeviceRuntime(
  deviceId: string,
  data: FirebaseFirestore.DocumentData | undefined,
): DeviceRuntimeData | null {
  const normalizedDeviceId = normalizeRuntimeDeviceId(deviceId);

  if (!data) {
    return null;
  }

  if (Number(data.schemaVersion ?? 0) !== DEVICE_RUNTIME_SCHEMA_VERSION) {
    return null;
  }

  const storedDeviceId = normalizeRuntimeDeviceId(data.deviceId ?? normalizedDeviceId);

  if (!storedDeviceId || storedDeviceId !== normalizedDeviceId) {
    return null;
  }

  const shutdownStatusRaw = String(data.shutdownStatus ?? "");
  const shutdownStatus: RuntimeShutdownStatus =
    shutdownStatusRaw === "SHUTDOWN_PENDING" ||
    shutdownStatusRaw === "SHUTDOWN_ACTIVE"
      ? shutdownStatusRaw
      : null;

  return {
    schemaVersion: DEVICE_RUNTIME_SCHEMA_VERSION,
    deviceId: normalizedDeviceId,
    cafeId: asNullableString(data.cafeId),

    preparingId: asNullableString(data.preparingId),
    preparingStartedAt: asTimestamp(data.preparingStartedAt),

    activeSessionId: asNullableString(data.activeSessionId),
    sessionStartedAt: asTimestamp(data.sessionStartedAt),
    sessionTotalMinutes: Math.max(0, Number(data.sessionTotalMinutes ?? 0)),
    sessionTotalPrice: Math.max(0, Number(data.sessionTotalPrice ?? 0)),

    shutdownId: asNullableString(data.shutdownId),
    shutdownStatus,
    shutdownStartedAt: asTimestamp(data.shutdownStartedAt),
    sourceSessionId: asNullableString(data.sourceSessionId),

    lastCompletedSessionId: asNullableString(data.lastCompletedSessionId),
    lastCompletedStartedAt: asTimestamp(data.lastCompletedStartedAt),
    lastCompletedEndedAt: asTimestamp(data.lastCompletedEndedAt),
    lastCompletedTotalMinutes: Math.max(
      0,
      Number(data.lastCompletedTotalMinutes ?? 0),
    ),
    lastCompletedTotalPrice: Math.max(
      0,
      Number(data.lastCompletedTotalPrice ?? 0),
    ),

    createdAt: asTimestamp(data.createdAt),
    updatedAt: asTimestamp(data.updatedAt),
  };
}

export function createEmptyDeviceRuntime(
  deviceId: string,
  cafeId: string | null,
  now = Timestamp.now(),
): DeviceRuntimeData {
  return {
    schemaVersion: DEVICE_RUNTIME_SCHEMA_VERSION,
    deviceId: normalizeRuntimeDeviceId(deviceId),
    cafeId: cafeId?.trim() || null,

    preparingId: null,
    preparingStartedAt: null,

    activeSessionId: null,
    sessionStartedAt: null,
    sessionTotalMinutes: 0,
    sessionTotalPrice: 0,

    shutdownId: null,
    shutdownStatus: null,
    shutdownStartedAt: null,
    sourceSessionId: null,

    lastCompletedSessionId: null,
    lastCompletedStartedAt: null,
    lastCompletedEndedAt: null,
    lastCompletedTotalMinutes: 0,
    lastCompletedTotalPrice: 0,

    createdAt: now,
    updatedAt: now,
  };
}

export function toRuntimeIso(value: FirebaseFirestore.Timestamp | null | undefined) {
  return value?.toDate?.().toISOString?.() ?? null;
}
