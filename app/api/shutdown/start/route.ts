import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessSession } from "@/lib/session-access";
import { createPerfTrace } from "@/lib/perf-trace";
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
    deviceId: data.deviceId ?? "",
    status: data.status ?? "SHUTDOWN_ACTIVE",
    startedAt: data.startedAt?.toDate?.().toISOString?.() ?? null,
    endedAt: data.endedAt?.toDate?.().toISOString?.() ?? null,
    operatorUid: data.operatorUid ?? null,
    sourceSessionId: data.sourceSessionId ?? null,
  };
}

export async function POST(request: Request) {
  const trace = createPerfTrace("api.shutdown.start");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const body = await trace.measure("requestJson", () => request.json());
    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();
    const sourceSessionId = body.sourceSessionId
      ? String(body.sourceSessionId).trim()
      : null;

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
    const now = Timestamp.now();
    const auditRef = adminDb.collection("audit_logs").doc();

    let runtimeHydrated = false;
    let activatedPending = false;
    let legacyFallback = false;

    const shutdown = await trace.measure("firestoreTransaction", () =>
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

        if (runtime.preparingId) {
          throw new Error("PREPARING_ACTIVE");
        }

        if (runtime.shutdownStatus === "SHUTDOWN_ACTIVE" && runtime.shutdownId) {
          if (runtimeHydrated) {
            transaction.set(runtimeRef, runtime, { merge: true });
          }

          return {
            id: runtime.shutdownId,
            deviceId,
            status: "SHUTDOWN_ACTIVE",
            startedAt: runtime.shutdownStartedAt,
            endedAt: null,
            operatorUid: null,
            sourceSessionId: runtime.sourceSessionId,
          };
        }

        if (runtime.shutdownStatus === "SHUTDOWN_PENDING" && runtime.shutdownId) {
          const shutdownRef = adminDb
            .collection("shutdown_sessions")
            .doc(runtime.shutdownId);

          transaction.update(shutdownRef, {
            status: "SHUTDOWN_ACTIVE",
            startedAt: now,
            endedAt: null,
            operatorUid: user.uid,
            operatorEmail: user.email ?? null,
            updatedAt: now,
          });

          transaction.set(
            runtimeRef,
            {
              ...runtime,
              schemaVersion: 1,
              deviceId,
              cafeId: registered.cafeId,
              shutdownStatus: "SHUTDOWN_ACTIVE",
              shutdownStartedAt: now,
              updatedAt: now,
            },
            { merge: true },
          );

          transaction.set(auditRef, {
            type: "SHUTDOWN_MODE_STARTED",
            deviceId,
            cafeId: registered.cafeId,
            shutdownId: runtime.shutdownId,
            sourceSessionId: runtime.sourceSessionId,
            operatorUid: user.uid,
            createdAt: now,
          });

          activatedPending = true;

          return {
            id: runtime.shutdownId,
            deviceId,
            status: "SHUTDOWN_ACTIVE",
            startedAt: now,
            endedAt: null,
            operatorUid: user.uid,
            sourceSessionId: runtime.sourceSessionId,
          };
        }

        /*
         * Backward compatibility: source session lama mungkin belum pernah
         * menghasilkan SHUTDOWN_PENDING. Jalur baru normal tidak masuk sini.
         */
        if (!sourceSessionId) {
          throw new Error("NO_SHUTDOWN_PENDING");
        }

        const sourceRef = adminDb.collection("sessions").doc(sourceSessionId);
        const sourceSession = await trace.measure("tx.legacySourceSession", () =>
          transaction.get(sourceRef),
        );

        if (!sourceSession.exists) {
          throw new Error("SOURCE_SESSION_NOT_FOUND");
        }

        const sourceData = sourceSession.data()!;

        if (
          !canAccessSession(user, sourceData) ||
          String(sourceData.deviceId ?? "").toUpperCase() !== deviceId
        ) {
          throw new Error("SOURCE_SESSION_MISMATCH");
        }

        if (sourceData.status !== "COMPLETED") {
          throw new Error("SOURCE_SESSION_NOT_COMPLETED");
        }

        const shutdownRef = adminDb
          .collection("shutdown_sessions")
          .doc(`session-${sourceSessionId}`);

        const data = {
          deviceId,
          cafeId: registered.cafeId,
          status: "SHUTDOWN_ACTIVE",
          pendingAt: now,
          startedAt: now,
          endedAt: null,
          sourceSessionId,
          operatorUid: user.uid,
          operatorEmail: user.email ?? null,
          createdAt: now,
          updatedAt: now,
        };

        transaction.set(shutdownRef, data, { merge: true });
        transaction.set(
          runtimeRef,
          {
            ...runtime,
            schemaVersion: 1,
            deviceId,
            cafeId: registered.cafeId,
            shutdownId: shutdownRef.id,
            shutdownStatus: "SHUTDOWN_ACTIVE",
            shutdownStartedAt: now,
            sourceSessionId,
            updatedAt: now,
          },
          { merge: true },
        );
        transaction.set(auditRef, {
          type: "SHUTDOWN_MODE_STARTED",
          deviceId,
          cafeId: registered.cafeId,
          shutdownId: shutdownRef.id,
          sourceSessionId,
          operatorUid: user.uid,
          createdAt: now,
        });

        legacyFallback = true;

        return {
          id: shutdownRef.id,
          ...data,
        };
      }),
    );

    trace.finish("ok", {
      activatedPending,
      legacyFallback,
      runtimeHydrated,
    });

    return Response.json({
      success: true,
      shutdown: serializeShutdown(shutdown.id, shutdown),
    });
  } catch (error) {
    trace.finish("error");
    console.error("START SHUTDOWN ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";

    if (message === "PREPARING_ACTIVE") {
      return Response.json(
        {
          success: false,
          error: "PREPARING masih aktif. Batalkan persiapan rental sebelum Shutdown Mode.",
        },
        { status: 409 },
      );
    }

    if (message === "NO_SHUTDOWN_PENDING") {
      return Response.json(
        { success: false, error: "Tidak ada shutdown pending untuk PlayBox ini" },
        { status: 409 },
      );
    }

    if (message === "SOURCE_SESSION_NOT_FOUND") {
      return Response.json(
        { success: false, error: "Source session tidak ditemukan" },
        { status: 404 },
      );
    }

    if (message === "SOURCE_SESSION_MISMATCH") {
      return Response.json(
        { success: false, error: "Source session tidak sesuai dengan PlayBox" },
        { status: 403 },
      );
    }

    if (message === "SOURCE_SESSION_NOT_COMPLETED") {
      return Response.json(
        { success: false, error: "Rental belum selesai" },
        { status: 409 },
      );
    }

    return Response.json(
      {
        success: false,
        error: message === "UNAUTHORIZED" ? "Unauthorized" : message,
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
