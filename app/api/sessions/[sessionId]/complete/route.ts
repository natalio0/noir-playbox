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

      if (session.status === "COMPLETED") {
        return {
          alreadyCompleted: true,
          startedAt: session.startedAt?.toDate?.()
            ? session.startedAt.toDate().toISOString()
            : null,
          endedAt:
            session.endedAt instanceof Timestamp
              ? session.endedAt.toDate().toISOString()
              : session.endedAt?.toDate?.()
                ? session.endedAt.toDate().toISOString()
                : null,
          totalMinutes: Number(session.totalMinutes ?? 0),
          totalPrice: Number(session.totalPrice ?? 0),
          packages: [] as Array<Record<string, unknown>>,
        };
      }

      if (session.status !== "ACTIVE") {
        throw new Error("SESSION_NOT_ACTIVE");
      }

      /*
       * Package query ikut berada di transaction. Add-time route juga
       * mengubah session doc dalam transaction, sehingga COMPLETE dan ADD TIME
       * yang datang bersamaan akan di-retry oleh Firestore dan tidak kehilangan
       * total billing.
       */
      const packagesQuery = sessionRef
        .collection("packages")
        .orderBy("addedAt", "asc");
      const packagesSnapshot = await transaction.get(packagesQuery);

      let totalMinutes = 0;
      let totalPrice = 0;

      const packages = packagesSnapshot.docs.map((packageDoc) => {
        const packageData = packageDoc.data();
        const durationMinutes = Number(packageData.durationMinutes ?? 0);
        const price = Number(packageData.price ?? 0);

        totalMinutes += durationMinutes;
        totalPrice += price;

        return {
          id: packageDoc.id,
          packageId:
            typeof packageData.packageId === "string"
              ? packageData.packageId
              : null,
          name: String(packageData.name ?? ""),
          durationMinutes,
          durationSeconds: Number(
            packageData.durationSeconds ?? durationMinutes * 60,
          ),
          price,
          type: packageData.type === "INITIAL" ? "INITIAL" : "ADD_TIME",
          addedAt: packageData.addedAt?.toDate?.()
            ? packageData.addedAt.toDate().toISOString()
            : null,
        };
      });

      const endedAt = Timestamp.now();

      transaction.update(sessionRef, {
        status: "COMPLETED",
        endedAt,
        totalMinutes,
        totalPrice,
        updatedAt: endedAt,
      });

      return {
        alreadyCompleted: false,
        startedAt: session.startedAt?.toDate?.()
          ? session.startedAt.toDate().toISOString()
          : null,
        endedAt: endedAt.toDate().toISOString(),
        totalMinutes,
        totalPrice,
        packages,
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
      packageCount: result.packages.length,
      packages: result.packages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyelesaikan session";

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
