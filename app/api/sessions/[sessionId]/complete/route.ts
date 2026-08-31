import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessCafe, canAccessSession } from "@/lib/session-access";
import { createPerfTrace } from "@/lib/perf-trace";
import {
  deviceRuntimeRef,
  parseDeviceRuntime,
  type DeviceRuntimeData,
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
    sourceSessionId: data.sourceSessionId ?? null,
  };
}

function shutdownFromRuntime(
  runtime: DeviceRuntimeData,
  shutdownId: string,
) {
  return {
    id: shutdownId,
    deviceId: runtime.deviceId,
    status: runtime.shutdownStatus ?? "SHUTDOWN_PENDING",
    startedAt: runtime.shutdownStartedAt?.toDate?.().toISOString?.() ?? null,
    endedAt: null,
    operatorUid: null,
    sourceSessionId: runtime.sourceSessionId,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const trace = createPerfTrace("api.sessions.complete");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const { sessionId } = await trace.measure("params", () => context.params);
    const body = await trace.measure("requestJson", () =>
      request.json().catch(() => ({})),
    );
    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId wajib diisi" },
        { status: 400 },
      );
    }

    const sessionRef = adminDb.collection("sessions").doc(sessionId);
    const shutdownRef = adminDb
      .collection("shutdown_sessions")
      .doc(`session-${sessionId}`);

    const result = await trace.measure("firestoreTransaction", () =>
      adminDb.runTransaction(async (transaction) => {
        const now = Timestamp.now();

        /* =====================================================
           FAST PATH

           Client terbaru mengirim deviceId. Satu read runtime cukup untuk:
           - authorization per cafe
           - memastikan session aktif yang benar
           - mengambil total billing terakhir
           - menjadi lock bersama ADD TIME vs COMPLETE
        ===================================================== */
        if (deviceId) {
          const runtimeRef = deviceRuntimeRef(deviceId);
          const runtimeSnapshot = await trace.measure("tx.runtimeRead", () =>
            transaction.get(runtimeRef),
          );
          const runtime = parseDeviceRuntime(deviceId, runtimeSnapshot.data());

          if (runtime && runtime.activeSessionId === sessionId) {
            if (!canAccessCafe(user, runtime.cafeId)) {
              throw new Error("SESSION_FORBIDDEN");
            }

            const shutdownData = {
              deviceId,
              cafeId: runtime.cafeId,
              status: "SHUTDOWN_PENDING",
              pendingAt: now,
              startedAt: null,
              endedAt: null,
              sourceSessionId: sessionId,
              operatorUid: user.uid,
              operatorEmail: user.email ?? null,
              createdAt: now,
              updatedAt: now,
            };

            transaction.update(sessionRef, {
              status: "COMPLETED",
              endedAt: now,
              updatedAt: now,
            });

            transaction.set(shutdownRef, shutdownData, { merge: true });

            transaction.set(
              runtimeRef,
              {
                schemaVersion: 1,
                deviceId,
                cafeId: runtime.cafeId,

                activeSessionId: null,
                sessionStartedAt: null,
                sessionTotalMinutes: 0,
                sessionTotalPrice: 0,

                shutdownId: shutdownRef.id,
                shutdownStatus: "SHUTDOWN_PENDING",
                shutdownStartedAt: null,
                sourceSessionId: sessionId,

                lastCompletedSessionId: sessionId,
                lastCompletedStartedAt: runtime.sessionStartedAt,
                lastCompletedEndedAt: now,
                lastCompletedTotalMinutes: runtime.sessionTotalMinutes,
                lastCompletedTotalPrice: runtime.sessionTotalPrice,
                updatedAt: now,
              },
              { merge: true },
            );

            return {
              fastPath: true,
              alreadyCompleted: false,
              startedAt:
                runtime.sessionStartedAt?.toDate?.().toISOString?.() ?? null,
              endedAt: now.toDate().toISOString(),
              totalMinutes: runtime.sessionTotalMinutes,
              totalPrice: runtime.sessionTotalPrice,
              shutdown: serializeShutdown(shutdownRef.id, shutdownData),
            };
          }

          if (
            runtime &&
            runtime.lastCompletedSessionId === sessionId &&
            runtime.sourceSessionId === sessionId &&
            runtime.shutdownId
          ) {
            if (!canAccessCafe(user, runtime.cafeId)) {
              throw new Error("SESSION_FORBIDDEN");
            }

            return {
              fastPath: true,
              alreadyCompleted: true,
              startedAt:
                runtime.lastCompletedStartedAt?.toDate?.().toISOString?.() ?? null,
              endedAt:
                runtime.lastCompletedEndedAt?.toDate?.().toISOString?.() ?? null,
              totalMinutes: runtime.lastCompletedTotalMinutes,
              totalPrice: runtime.lastCompletedTotalPrice,
              shutdown: shutdownFromRuntime(runtime, runtime.shutdownId),
            };
          }

          if (runtime && runtime.activeSessionId && runtime.activeSessionId !== sessionId) {
            throw new Error("SESSION_RUNTIME_MISMATCH");
          }
        }

        /* =====================================================
           LEGACY / SELF-HEAL FALLBACK
        ===================================================== */
        const sessionSnapshot = await trace.measure("tx.legacySessionRead", () =>
          transaction.get(sessionRef),
        );
        const shutdownSnapshot = await trace.measure("tx.legacyShutdownRead", () =>
          transaction.get(shutdownRef),
        );

        if (!sessionSnapshot.exists) {
          throw new Error("SESSION_NOT_FOUND");
        }

        const session = sessionSnapshot.data();

        if (!session) {
          throw new Error("SESSION_NOT_FOUND");
        }

        if (!canAccessSession(user, session)) {
          throw new Error("SESSION_FORBIDDEN");
        }

        const resolvedDeviceId = String(session.deviceId ?? "")
          .trim()
          .toUpperCase();
        const cafeId = String(session.cafeId ?? "").trim();
        const startedAt = session.startedAt?.toDate?.()
          ? session.startedAt.toDate().toISOString()
          : null;
        const totalMinutes = Number(session.totalMinutes ?? 0);
        const totalPrice = Number(session.totalPrice ?? 0);

        if (!resolvedDeviceId || !cafeId) {
          throw new Error("SESSION_CONTEXT_INVALID");
        }

        let shutdownData = shutdownSnapshot.exists
          ? shutdownSnapshot.data() ?? null
          : null;

        if (session.status === "ACTIVE") {
          transaction.update(sessionRef, {
            status: "COMPLETED",
            endedAt: now,
            updatedAt: now,
          });
        } else if (session.status !== "COMPLETED") {
          throw new Error("SESSION_NOT_ACTIVE");
        }

        if (!shutdownData) {
          shutdownData = {
            deviceId: resolvedDeviceId,
            cafeId,
            status: "SHUTDOWN_PENDING",
            pendingAt: now,
            startedAt: null,
            endedAt: null,
            sourceSessionId: sessionId,
            operatorUid: user.uid,
            operatorEmail: user.email ?? null,
            createdAt: now,
            updatedAt: now,
          };

          transaction.set(shutdownRef, shutdownData);
        }

        const runtimeRef = deviceRuntimeRef(resolvedDeviceId);
        const shutdownStatus =
          shutdownData.status === "SHUTDOWN_ACTIVE"
            ? "SHUTDOWN_ACTIVE"
            : shutdownData.status === "SHUTDOWN_PENDING"
              ? "SHUTDOWN_PENDING"
              : null;

        transaction.set(
          runtimeRef,
          {
            schemaVersion: 1,
            deviceId: resolvedDeviceId,
            cafeId,
            preparingId: null,
            preparingStartedAt: null,
            activeSessionId: null,
            sessionStartedAt: null,
            sessionTotalMinutes: 0,
            sessionTotalPrice: 0,
            shutdownId: shutdownStatus ? shutdownRef.id : null,
            shutdownStatus,
            shutdownStartedAt: shutdownStatus ? shutdownData.startedAt ?? null : null,
            sourceSessionId: shutdownStatus ? sessionId : null,
            lastCompletedSessionId: sessionId,
            lastCompletedStartedAt: session.startedAt ?? null,
            lastCompletedEndedAt:
              session.status === "COMPLETED" ? session.endedAt ?? now : now,
            lastCompletedTotalMinutes: totalMinutes,
            lastCompletedTotalPrice: totalPrice,
            updatedAt: now,
          },
          { merge: true },
        );

        return {
          fastPath: false,
          alreadyCompleted: session.status === "COMPLETED",
          startedAt,
          endedAt:
            session.status === "COMPLETED"
              ? session.endedAt?.toDate?.().toISOString?.() ?? null
              : now.toDate().toISOString(),
          totalMinutes,
          totalPrice,
          shutdown: serializeShutdown(shutdownRef.id, shutdownData),
        };
      }),
    );

    trace.finish("ok", {
      alreadyCompleted: result.alreadyCompleted,
      fastPath: result.fastPath,
    });

    return NextResponse.json({
      success: true,
      alreadyCompleted: result.alreadyCompleted,
      sessionId,
      status: "COMPLETED",
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      totalMinutes: result.totalMinutes,
      totalPrice: result.totalPrice,
      shutdown: result.shutdown,
    });
  } catch (error) {
    trace.finish("error");
    const message =
      error instanceof Error ? error.message : "Gagal menyelesaikan session";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    if (message === "SESSION_FORBIDDEN") {
      return NextResponse.json(
        { success: false, error: "Tidak memiliki akses ke session ini" },
        { status: 403 },
      );
    }

    if (message === "SESSION_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Session tidak ditemukan" },
        { status: 404 },
      );
    }

    if (message === "SESSION_NOT_ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Session sudah tidak aktif" },
        { status: 409 },
      );
    }

    if (message === "SESSION_RUNTIME_MISMATCH") {
      return NextResponse.json(
        {
          success: false,
          error: "Runtime PlayBox sudah menunjuk ke rental lain. Refresh halaman.",
        },
        { status: 409 },
      );
    }

    if (message === "SESSION_CONTEXT_INVALID") {
      return NextResponse.json(
        { success: false, error: "Session belum memiliki device/cafe yang valid" },
        { status: 409 },
      );
    }

    console.error("COMPLETE SESSION ERROR:", error);

    return NextResponse.json(
      { success: false, error: "Gagal menyelesaikan session" },
      { status: 500 },
    );
  }
}
