import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import {
  createEmptyDeviceRuntime,
  deviceRuntimeRef,
  parseDeviceRuntime,
} from "@/lib/device-runtime";

function serializeShutdown(
  id: string,
  data: FirebaseFirestore.DocumentData,
) {
  return {
    id,
    deviceId: String(data.deviceId ?? ""),
    status: String(data.status ?? "SHUTDOWN_PENDING"),
    startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
    endedAt: data.endedAt?.toDate?.().toISOString?.() ?? null,
    operatorUid: data.operatorUid ?? null,
    sourceSessionId: null,
    isTest: true,
  };
}

/**
 * Creates a non-billed shutdown pending record for an operator test.
 * The normal start/complete shutdown endpoints then run the same monitor
 * confirmation path used by production rentals.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    const registered = await resolveRegisteredDevice(deviceId);
    if (!registered || !registered.active) {
      return Response.json(
        { success: false, error: "PlayBox tidak ditemukan" },
        { status: 404 },
      );
    }
    if (!canAccessDevice(user.profile, registered)) {
      return Response.json(
        { success: false, error: "Tidak memiliki akses ke PlayBox ini" },
        { status: 403 },
      );
    }
    if (!registered.cafeId) {
      return Response.json(
        { success: false, error: "PlayBox belum memiliki cafeId" },
        { status: 409 },
      );
    }

    const runtimeRef = deviceRuntimeRef(deviceId);
    const shutdownRef = adminDb.collection("shutdown_sessions").doc();
    const auditRef = adminDb.collection("audit_logs").doc();

    const shutdown = await adminDb.runTransaction(async (transaction) => {
      const now = Timestamp.now();
      const runtimeSnapshot = await transaction.get(runtimeRef);
      const runtime =
        parseDeviceRuntime(deviceId, runtimeSnapshot.data()) ??
        createEmptyDeviceRuntime(deviceId, registered.cafeId, now);

      if (runtime.activeSessionId || runtime.preparingId || runtime.shutdownId) {
        throw new Error("DEVICE_NOT_READY");
      }

      const data = {
        deviceId,
        cafeId: registered.cafeId,
        status: "SHUTDOWN_PENDING",
        pendingAt: now,
        startedAt: null,
        endedAt: null,
        sourceSessionId: null,
        operatorUid: user.uid,
        operatorEmail: user.email ?? null,
        createdAt: now,
        updatedAt: now,
        isTest: true,
      };

      transaction.set(shutdownRef, data);
      transaction.set(
        runtimeRef,
        {
          ...runtime,
          schemaVersion: 1,
          deviceId,
          cafeId: registered.cafeId,
          shutdownId: shutdownRef.id,
          shutdownStatus: "SHUTDOWN_PENDING",
          shutdownStartedAt: null,
          sourceSessionId: null,
          updatedAt: now,
        },
        { merge: true },
      );
      transaction.set(auditRef, {
        type: "SHUTDOWN_TEST_PENDING_CREATED",
        deviceId,
        cafeId: registered.cafeId,
        shutdownId: shutdownRef.id,
        operatorUid: user.uid,
        createdAt: now,
      });

      return { id: shutdownRef.id, ...data };
    });

    return Response.json({
      success: true,
      shutdown: serializeShutdown(shutdown.id, shutdown),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat tes shutdown";
    if (message === "DEVICE_NOT_READY") {
      return Response.json(
        {
          success: false,
          error: "PlayBox harus READY. Selesaikan rental, preparing, atau shutdown yang masih aktif.",
        },
        { status: 409 },
      );
    }
    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
