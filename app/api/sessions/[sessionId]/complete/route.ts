import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessSession } from "@/lib/session-access";
import { createPerfTrace } from "@/lib/perf-trace";

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const trace = createPerfTrace("api.sessions.complete");

  try {
    const user = await trace.measure("auth", () => requireUserFromRequest(request));
    const { sessionId } = await trace.measure("params", () => context.params);

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId wajib diisi" },
        { status: 400 },
      );
    }

    const sessionRef = adminDb.collection("sessions").doc(sessionId);

    /*
     * Satu rental = satu record shutdown deterministic.
     * Karena ID-nya deterministic, refresh/retry tidak membuat duplikat.
     */
    const shutdownRef = adminDb
      .collection("shutdown_sessions")
      .doc(`session-${sessionId}`);

    const result = await trace.measure("firestoreTransaction", () =>
      adminDb.runTransaction(async (transaction) => {
      const sessionSnapshot = await trace.measure("tx.sessionRead", () =>
        transaction.get(sessionRef),
      );
      const shutdownSnapshot = await trace.measure("tx.shutdownRead", () =>
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

      const deviceId = String(session.deviceId ?? "").trim().toUpperCase();
      const cafeId = String(session.cafeId ?? "").trim();
      const startedAt = session.startedAt?.toDate?.()
        ? session.startedAt.toDate().toISOString()
        : null;
      const totalMinutes = Number(session.totalMinutes ?? 0);
      const totalPrice = Number(session.totalPrice ?? 0);
      const now = Timestamp.now();

      if (!deviceId || !cafeId) {
        throw new Error("SESSION_CONTEXT_INVALID");
      }

      let shutdownData = shutdownSnapshot.exists
        ? shutdownSnapshot.data() ?? null
        : null;

      /*
       * COMPLETE harus idempotent. Bahkan kalau session sudah COMPLETED tetapi
       * pending shutdown belum ada (mis. retry request), pending tetap dibuat.
       */
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
          deviceId,
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

      return {
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

    trace.finish("ok", { alreadyCompleted: result.alreadyCompleted });

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
