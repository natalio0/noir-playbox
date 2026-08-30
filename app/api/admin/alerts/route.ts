import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);

    if (user.profile?.role !== "admin") {
      return Response.json(
        {
          success: false,
          error: "Akses hanya untuk admin",
        },
        { status: 403 },
      );
    }

    const [
      preparingSnapshot,
      shutdownSnapshot,
      auditSnapshot,
    ] = await Promise.all([
      adminDb
        .collection("preparing_sessions")
        .where("status", "==", "PREPARING")
        .get(),

      adminDb
        .collection("shutdown_sessions")
        .where("status", "==", "SHUTDOWN_ACTIVE")
        .get(),

      adminDb
        .collection("audit_logs")
        .where(
          "type",
          "==",
          "PREPARING_ENDED_WITHOUT_BILLING",
        )
        .limit(30)
        .get(),
    ]);

    const now = Date.now();

    const preparing = preparingSnapshot.docs
      .map((doc) => {
        const data = doc.data();

        const startedAt =
          data.startedAt?.toDate?.() ?? null;

        const startedAtMs =
          startedAt instanceof Date
            ? startedAt.getTime()
            : now;

        const elapsedMinutes = Math.max(
          0,
          Math.floor(
            (now - startedAtMs) / 60_000,
          ),
        );

        const riskLevel =
          elapsedMinutes >= 60
            ? "SUSPICIOUS"
            : elapsedMinutes >= 45
              ? "WARNING"
              : "NORMAL";

        return {
          id: doc.id,
          deviceId: data.deviceId ?? "-",
          cafeId: data.cafeId ?? "-",
          operatorUid: data.operatorUid ?? null,
          operatorEmail: data.operatorEmail ?? null,
          startedAt:
            startedAt instanceof Date
              ? startedAt.toISOString()
              : null,
          elapsedMinutes,
          riskLevel,
        };
      })
      .sort(
        (a, b) =>
          b.elapsedMinutes - a.elapsedMinutes,
      );

    const shutdown = shutdownSnapshot.docs
      .map((doc) => {
        const data = doc.data();

        const startedAt =
          data.startedAt?.toDate?.() ?? null;

        const startedAtMs =
          startedAt instanceof Date
            ? startedAt.getTime()
            : now;

        const elapsedMinutes = Math.max(
          0,
          Math.floor(
            (now - startedAtMs) / 60_000,
          ),
        );

        return {
          id: doc.id,
          deviceId: data.deviceId ?? "-",
          cafeId: data.cafeId ?? "-",
          sourceSessionId:
            data.sourceSessionId ?? null,
          startedAt:
            startedAt instanceof Date
              ? startedAt.toISOString()
              : null,
          elapsedMinutes,
        };
      })
      .sort(
        (a, b) =>
          b.elapsedMinutes - a.elapsedMinutes,
      );

    const endedWithoutBilling =
      auditSnapshot.docs
        .map((doc) => {
          const data = doc.data();

          const createdAt =
            data.createdAt?.toDate?.() ?? null;

          return {
            id: doc.id,
            deviceId: data.deviceId ?? "-",
            cafeId: data.cafeId ?? "-",
            durationMinutes:
              Number(data.durationMinutes ?? 0),
            riskLevel:
              data.riskLevel ?? "NORMAL",
            operatorUid:
              data.operatorUid ?? null,
            createdAt:
              createdAt instanceof Date
                ? createdAt.toISOString()
                : null,
          };
        })
        .sort((a, b) => {
          const aMs = a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;

          const bMs = b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;

          return bMs - aMs;
        });

    return Response.json({
      success: true,
      generatedAt: new Date().toISOString(),
      summary: {
        preparingTotal: preparing.length,
        preparingWarning: preparing.filter(
          (item) => item.riskLevel === "WARNING",
        ).length,
        preparingSuspicious: preparing.filter(
          (item) =>
            item.riskLevel === "SUSPICIOUS",
        ).length,
        shutdownActive: shutdown.length,
        endedWithoutBilling:
          endedWithoutBilling.length,
      },
      preparing,
      shutdown,
      endedWithoutBilling,
    });
  } catch (error) {
    console.error("ADMIN ALERTS ERROR:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Internal server error";

    return Response.json(
      {
        success: false,
        error:
          message === "UNAUTHORIZED"
            ? "Unauthorized"
            : message,
      },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}
