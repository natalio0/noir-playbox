import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { createPerfTrace } from "@/lib/perf-trace";
import {
  createEmptyDeviceRuntime,
  deviceRuntimeRef,
  parseDeviceRuntime,
} from "@/lib/device-runtime";

export async function POST(request: Request) {
  const trace = createPerfTrace("api.preparing.start");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const body = await trace.measure("requestJson", () => request.json());
    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();

    if (!deviceId) {
      return Response.json(
        { success: false, error: "deviceId wajib diisi" },
        { status: 400 },
      );
    }

    const registered = await trace.measure("deviceRegistry", () =>
      resolveRegisteredDevice(deviceId),
    );

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
    const preparingRef = adminDb.collection("preparing_sessions").doc();
    const now = Timestamp.now();

    let runtimeHydrated = false;
    let reusedExisting = false;

    const result = await trace.measure("firestoreTransaction", () =>
      adminDb.runTransaction(async (transaction) => {
        const runtimeSnapshot = await trace.measure("tx.runtimeRead", () =>
          transaction.get(runtimeRef),
        );
        let runtime = parseDeviceRuntime(deviceId, runtimeSnapshot.data());

        if (!runtime) {
          runtimeHydrated = true;
          runtime = createEmptyDeviceRuntime(deviceId, registered.cafeId, now);

          const activeSessionQuery = adminDb
            .collection("sessions")
            .where("deviceId", "==", deviceId)
            .where("status", "==", "ACTIVE")
            .limit(1);
          const preparingQuery = adminDb
            .collection("preparing_sessions")
            .where("deviceId", "==", deviceId)
            .where("status", "==", "PREPARING")
            .limit(1);
          const activeShutdownQuery = adminDb
            .collection("shutdown_sessions")
            .where("deviceId", "==", deviceId)
            .where("status", "==", "SHUTDOWN_ACTIVE")
            .limit(1);
          const pendingShutdownQuery = adminDb
            .collection("shutdown_sessions")
            .where("deviceId", "==", deviceId)
            .where("status", "==", "SHUTDOWN_PENDING")
            .limit(1);

          const activeSession = await trace.measure("tx.legacyActiveSession", () =>
            transaction.get(activeSessionQuery),
          );
          const preparing = await trace.measure("tx.legacyPreparing", () =>
            transaction.get(preparingQuery),
          );
          const activeShutdown = await trace.measure("tx.legacyActiveShutdown", () =>
            transaction.get(activeShutdownQuery),
          );
          const pendingShutdown = await trace.measure("tx.legacyPendingShutdown", () =>
            transaction.get(pendingShutdownQuery),
          );

          if (!activeSession.empty) {
            const doc = activeSession.docs[0];
            const data = doc.data();
            runtime.activeSessionId = doc.id;
            runtime.sessionStartedAt = data.startedAt ?? null;
            runtime.sessionTotalMinutes = Number(data.totalMinutes ?? 0);
            runtime.sessionTotalPrice = Number(data.totalPrice ?? 0);
          }

          if (!preparing.empty) {
            const doc = preparing.docs[0];
            const data = doc.data();
            runtime.preparingId = doc.id;
            runtime.preparingStartedAt = data.startedAt ?? null;
          }

          const shutdownDoc = !activeShutdown.empty
            ? activeShutdown.docs[0]
            : !pendingShutdown.empty
              ? pendingShutdown.docs[0]
              : null;

          if (shutdownDoc) {
            const data = shutdownDoc.data();
            runtime.shutdownId = shutdownDoc.id;
            runtime.shutdownStatus =
              data.status === "SHUTDOWN_ACTIVE"
                ? "SHUTDOWN_ACTIVE"
                : "SHUTDOWN_PENDING";
            runtime.shutdownStartedAt = data.startedAt ?? null;
            runtime.sourceSessionId =
              typeof data.sourceSessionId === "string"
                ? data.sourceSessionId
                : null;
          }
        }

        if (runtime.shutdownStatus === "SHUTDOWN_ACTIVE") {
          throw new Error("SHUTDOWN_ACTIVE");
        }

        if (runtime.activeSessionId) {
          throw new Error("SESSION_ACTIVE");
        }

        if (runtime.preparingId) {
          reusedExisting = true;

          if (runtimeHydrated) {
            transaction.set(runtimeRef, runtime, { merge: true });
          }

          return {
            id: runtime.preparingId,
            deviceId,
            status: "PREPARING",
            startedAt:
              runtime.preparingStartedAt?.toDate?.().toISOString?.() ?? null,
            activatedAt: null,
            endedAt: null,
            billingSessionId: null,
            operatorUid: null,
          };
        }

        transaction.set(preparingRef, {
          deviceId,
          cafeId: registered.cafeId,
          status: "PREPARING",
          startedAt: now,
          activatedAt: null,
          endedAt: null,
          billingSessionId: null,
          operatorUid: user.uid,
          operatorEmail: user.email,
          createdAt: now,
          updatedAt: now,
        });

        transaction.set(
          runtimeRef,
          {
            ...runtime,
            schemaVersion: 1,
            deviceId,
            cafeId: registered.cafeId,
            preparingId: preparingRef.id,
            preparingStartedAt: now,
            updatedAt: now,
          },
          { merge: true },
        );

        return {
          id: preparingRef.id,
          deviceId,
          status: "PREPARING",
          startedAt: now.toDate().toISOString(),
          activatedAt: null,
          endedAt: null,
          billingSessionId: null,
          operatorUid: user.uid,
        };
      }),
    );

    trace.finish("ok", { reusedExisting, runtimeHydrated });

    return Response.json({
      success: true,
      preparing: result,
    });
  } catch (error) {
    trace.finish("error");
    console.error("START PREPARING ERROR:", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    if (message === "SHUTDOWN_ACTIVE") {
      return Response.json(
        {
          success: false,
          error: "Shutdown Mode masih aktif. Selesaikan shutdown terlebih dahulu.",
        },
        { status: 409 },
      );
    }

    if (message === "SESSION_ACTIVE") {
      return Response.json(
        { success: false, error: "Rental masih aktif pada PlayBox ini" },
        { status: 409 },
      );
    }

    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
