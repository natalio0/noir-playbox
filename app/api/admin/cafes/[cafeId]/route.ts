import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      cafeId: string;
    }>;
  },
) {
  try {
    const user =
      await requireUserFromRequest(
        request,
      );

    if (
      user.profile?.role !==
      "admin"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Akses hanya untuk admin",
        },
        { status: 403 },
      );
    }

    const { cafeId } =
      await context.params;

    const [
      cafeDoc,
      deviceSnapshot,
      sessionSnapshot,
    ] = await Promise.all([
      adminDb
        .collection("cafes")
        .doc(cafeId)
        .get(),

      adminDb
        .collection("devices")
        .where(
          "cafeId",
          "==",
          cafeId,
        )
        .get(),

      adminDb
        .collection("sessions")
        .where(
          "cafeId",
          "==",
          cafeId,
        )
        .get(),
    ]);

    if (!cafeDoc.exists) {
      return Response.json(
        {
          success: false,
          error:
            "Cafe tidak ditemukan",
        },
        { status: 404 },
      );
    }

    const cafeData =
      cafeDoc.data()!;

    const cafe = {
      id: cafeDoc.id,
      name: String(
        cafeData.name ??
          cafeDoc.id,
      ),
      active:
        cafeData.active !== false,
      revenueShareNoir:
        Number(
          cafeData
            .revenueShareNoir ??
            70,
        ),
      revenueShareCafe:
        Number(
          cafeData
            .revenueShareCafe ??
            30,
        ),
    };

    const devices =
      deviceSnapshot.docs
        .map((doc) => {
          const data =
            doc.data();

          return {
            id: doc.id,
            deviceId:
              String(
                data.deviceId ??
                  doc.id,
              ).toUpperCase(),
            name:
              String(
                data.name ??
                  doc.id,
              ),
            active:
              data.active !==
              false,
          };
        })
        .sort((a, b) =>
          a.deviceId.localeCompare(
            b.deviceId,
          ),
        );

    const sessions =
      sessionSnapshot.docs
        .map((doc) => {
          const data =
            doc.data();

          return {
            id: doc.id,
            deviceId:
              String(
                data.deviceId ??
                  "-",
              ).toUpperCase(),
            status:
              data.status ===
              "ACTIVE"
                ? "ACTIVE"
                : "COMPLETED",
            startedAt:
              toIso(
                data.startedAt,
              ),
            endedAt:
              toIso(
                data.endedAt,
              ),
            totalMinutes:
              Number(
                data.totalMinutes ??
                  0,
              ),
            totalPrice:
              Number(
                data.totalPrice ??
                  0,
              ),
          };
        })
        .sort((a, b) => {
          const aTime =
            a.startedAt
              ? new Date(
                  a.startedAt,
                ).getTime()
              : 0;

          const bTime =
            b.startedAt
              ? new Date(
                  b.startedAt,
                ).getTime()
              : 0;

          return bTime - aTime;
        });

    const completed =
      sessions.filter(
        (session) =>
          session.status ===
          "COMPLETED",
      );

    const activeSessions =
      sessions.filter(
        (session) =>
          session.status ===
          "ACTIVE",
      );

    const now =
      new Date();

    const monthStart =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).getTime();

    const completedThisMonth =
      completed.filter(
        (session) =>
          session.startedAt &&
          new Date(
            session.startedAt,
          ).getTime() >=
            monthStart,
      );

    const grossRevenue =
      completedThisMonth.reduce(
        (sum, session) =>
          sum +
          session.totalPrice,
        0,
      );

    const totalMinutes =
      completedThisMonth.reduce(
        (sum, session) =>
          sum +
          session.totalMinutes,
        0,
      );

    const noirShare =
      Math.round(
        grossRevenue *
          (cafe.revenueShareNoir /
            100),
      );

    const cafeShare =
      Math.round(
        grossRevenue *
          (cafe.revenueShareCafe /
            100),
      );

    const perDeviceMap =
      new Map<
        string,
        {
          deviceId: string;
          sessions: number;
          revenue: number;
          minutes: number;
          activeNow: boolean;
        }
      >();

    for (
      const device of devices
    ) {
      perDeviceMap.set(
        device.deviceId,
        {
          deviceId:
            device.deviceId,
          sessions: 0,
          revenue: 0,
          minutes: 0,
          activeNow: false,
        },
      );
    }

    for (
      const session of
      completedThisMonth
    ) {
      const current =
        perDeviceMap.get(
          session.deviceId,
        ) ?? {
          deviceId:
            session.deviceId,
          sessions: 0,
          revenue: 0,
          minutes: 0,
          activeNow: false,
        };

      current.sessions += 1;

      current.revenue +=
        session.totalPrice;

      current.minutes +=
        session.totalMinutes;

      perDeviceMap.set(
        session.deviceId,
        current,
      );
    }

    for (
      const session of
      activeSessions
    ) {
      const current =
        perDeviceMap.get(
          session.deviceId,
        ) ?? {
          deviceId:
            session.deviceId,
          sessions: 0,
          revenue: 0,
          minutes: 0,
          activeNow: false,
        };

      current.activeNow =
        true;

      perDeviceMap.set(
        session.deviceId,
        current,
      );
    }

    return Response.json({
      success: true,

      cafe,

      summary: {
        totalDevices:
          devices.length,

        activeSessions:
          activeSessions.length,

        completedSessionsThisMonth:
          completedThisMonth.length,

        grossRevenue,

        noirShare,

        cafeShare,

        totalMinutes,
      },

      devices: Array.from(
        perDeviceMap.values(),
      ).sort((a, b) =>
        a.deviceId.localeCompare(
          b.deviceId,
        ),
      ),

      recentSessions:
        sessions.slice(0, 20),

      generatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Internal server error";

    return Response.json(
      {
        success: false,
        error:
          message ===
          "UNAUTHORIZED"
            ? "Unauthorized"
            : message,
      },
      {
        status:
          message ===
          "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}

function toIso(
  value: unknown,
) {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
      "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: () => Date;
      }
    ).toDate ===
      "function"
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    )
      .toDate()
      .toISOString();
  }

  const date =
    new Date(
      value as string | number,
    );

  return Number.isFinite(
    date.getTime(),
  )
    ? date.toISOString()
    : null;
}
