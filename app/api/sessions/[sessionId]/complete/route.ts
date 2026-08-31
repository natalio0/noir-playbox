import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { canAccessSession } from "@/lib/session-access";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await requireUserFromRequest(request);
    const { sessionId } = await context.params;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId wajib diisi" },
        { status: 400 },
      );
    }

    const sessionRef = adminDb.collection("sessions").doc(sessionId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionRef);

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

      const startedAt = session.startedAt?.toDate?.()
        ? session.startedAt.toDate().toISOString()
        : null;
      const totalMinutes = Number(session.totalMinutes ?? 0);
      const totalPrice = Number(session.totalPrice ?? 0);

      if (session.status === "COMPLETED") {
        return {
          alreadyCompleted: true,
          startedAt,
          endedAt:
            session.endedAt instanceof Timestamp
              ? session.endedAt.toDate().toISOString()
              : session.endedAt?.toDate?.()
                ? session.endedAt.toDate().toISOString()
                : null,
          totalMinutes,
          totalPrice,
        };
      }

      if (session.status !== "ACTIVE") {
        throw new Error("SESSION_NOT_ACTIVE");
      }

      /*
       * totalMinutes dan totalPrice sudah dijaga transactionally oleh route
       * ADD TIME. COMPLETE cukup menyentuh session doc yang sama.
       * Jika ADD TIME datang bersamaan, Firestore akan mendeteksi conflict dan
       * me-retry salah satu transaction sehingga total billing tidak hilang.
       *
       * Ini menghapus query seluruh subcollection packages dari jalur STOP.
       */
      const endedAt = Timestamp.now();

      transaction.update(sessionRef, {
        status: "COMPLETED",
        endedAt,
        updatedAt: endedAt,
      });

      return {
        alreadyCompleted: false,
        startedAt,
        endedAt: endedAt.toDate().toISOString(),
        totalMinutes,
        totalPrice,
      };
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
    });
  } catch (error) {
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

    console.error("COMPLETE SESSION ERROR:", error);

    return NextResponse.json(
      { success: false, error: "Gagal menyelesaikan session" },
      { status: 500 },
    );
  }
}
