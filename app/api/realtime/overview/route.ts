import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { listRegisteredDevicesForUser } from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { getDynamicTuyaState } from "@/lib/tuya-cloud-dynamic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveSessionPayload = {
  id: string;
  deviceId: string;
  status: "ACTIVE";
  startedAt: string | null;
  endedAt: null;
  totalMinutes: number;
  totalPrice: number;
};

function toIso(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();

    if (date instanceof Date && Number.isFinite(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);

    const registryDevices = await listRegisteredDevicesForUser(user.profile);

    const allowedDeviceIds = new Set(
      registryDevices.map((device) => device.deviceId.toUpperCase()),
    );

    const activeSnapshot = await adminDb
      .collection("sessions")
      .where("status", "==", "ACTIVE")
      .get();

    const activeByDevice = new Map<string, ActiveSessionPayload>();

    for (const sessionDoc of activeSnapshot.docs) {
      const data = sessionDoc.data();
      const deviceId = String(data.deviceId ?? "").trim().toUpperCase();

      if (!deviceId || !allowedDeviceIds.has(deviceId)) {
        continue;
      }

      const candidate: ActiveSessionPayload = {
        id: sessionDoc.id,
        deviceId,
        status: "ACTIVE",
        startedAt: toIso(data.startedAt),
        endedAt: null,
        totalMinutes: Number(data.totalMinutes ?? 0),
        totalPrice: Number(data.totalPrice ?? 0),
      };

      const existing = activeByDevice.get(deviceId);

      if (!existing) {
        activeByDevice.set(deviceId, candidate);
        continue;
      }

      const existingTime = existing.startedAt
        ? new Date(existing.startedAt).getTime()
        : 0;
      const candidateTime = candidate.startedAt
        ? new Date(candidate.startedAt).getTime()
        : 0;

      if (candidateTime > existingTime) {
        activeByDevice.set(deviceId, candidate);
      }
    }

    const realtimeDevices = await Promise.all(
      registryDevices.map(async (registered) => {
        const deviceId = registered.deviceId.toUpperCase();
        const session = activeByDevice.get(deviceId) ?? null;
        const tuyaDeviceId = registered.tuyaDeviceId?.trim() || null;

        if (!tuyaDeviceId) {
          return {
            id: deviceId,
            status: "OFFLINE" as const,
            online: false,
            state: null,
            loading: false,
            error: "Tuya device belum dikonfigurasi",
            accessDenied: false,
            updatedAt: new Date().toISOString(),
            session,
          };
        }

        try {
          const state = await getDynamicTuyaState(tuyaDeviceId);

          return {
            id: deviceId,
            status: state.switch ? "ON" : "OFF",
            online: true,
            state,
            loading: false,
            error: null,
            accessDenied: false,
            updatedAt: new Date().toISOString(),
            session,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Device offline";
          const normalized = message.toLowerCase();

          const offline =
            normalized.includes("offline") ||
            normalized.includes("not online") ||
            normalized.includes("device is offline") ||
            message.includes("40000801");

          return {
            id: deviceId,
            status: "OFFLINE" as const,
            online: false,
            state: null,
            loading: false,
            error: offline ? null : message,
            accessDenied: false,
            updatedAt: new Date().toISOString(),
            session,
          };
        }
      }),
    );

    return NextResponse.json({
      success: true,
      registryDevices,
      devices: realtimeDevices,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil realtime overview";

    return NextResponse.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      {
        status: message === "UNAUTHORIZED" ? 401 : 500,
      },
    );
  }
}
