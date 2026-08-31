import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

type SessionRow = {
  id: string;
  deviceId: string;
  cafeId: string | null;
  status: "ACTIVE" | "COMPLETED";
  startedAt: string | null;
  endedAt: string | null;
  totalMinutes: number;
  totalPrice: number;
};

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

    const { searchParams } =
      new URL(request.url);

    const period =
      searchParams.get("period") ??
      "daily";

    const cafeFilter =
      searchParams.get("cafeId") ??
      "all";

    const now = new Date();

    const range = getRange(
      period,
      now,
    );

    /*
     * Jangan membaca seluruh collection sessions.
     * Firestore langsung membatasi read ke periode yang diminta.
     */
    const sessionQuery = adminDb
      .collection("sessions")
      .where("startedAt", ">=", new Date(range.start))
      .where("startedAt", "<=", new Date(range.end))
      .select(
        "deviceId",
        "cafeId",
        "status",
        "startedAt",
        "endedAt",
        "totalMinutes",
        "totalPrice",
      );

    const [sessionSnapshot, cafeSnapshot] = await Promise.all([
      sessionQuery.get(),
      adminDb.collection("cafes").get(),
    ]);

    const cafeMap = new Map(
      cafeSnapshot.docs.map((doc) => {
        const data = doc.data();

        return [
          doc.id,
          {
            id: doc.id,
            name: String(
              data.name ?? doc.id,
            ),
            revenueShareNoir: Number(
              data.revenueShareNoir ?? 70,
            ),
            revenueShareCafe: Number(
              data.revenueShareCafe ?? 30,
            ),
          },
        ];
      }),
    );

    const sessions: SessionRow[] =
      sessionSnapshot.docs.map((doc) => {
        const data = doc.data();

        return {
          id: doc.id,
          deviceId: String(
            data.deviceId ?? "-",
          ).toUpperCase(),
          cafeId: data.cafeId
            ? String(data.cafeId)
            : null,
          status:
            data.status === "ACTIVE"
              ? "ACTIVE"
              : "COMPLETED",
          startedAt: toIso(
            data.startedAt,
          ),
          endedAt: toIso(
            data.endedAt,
          ),
          totalMinutes: Number(
            data.totalMinutes ?? 0,
          ),
          totalPrice: Number(
            data.totalPrice ?? 0,
          ),
        };
      });

    const filtered = sessions
      .filter((session) => {
        const startedAt =
          session.startedAt
            ? new Date(
                session.startedAt,
              ).getTime()
            : 0;

        const inPeriod =
          startedAt >= range.start &&
          startedAt <= range.end;

        const inCafe =
          cafeFilter === "all" ||
          session.cafeId ===
            cafeFilter;

        return inPeriod && inCafe;
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
      filtered.filter(
        (session) =>
          session.status ===
          "COMPLETED",
      );

    const active =
      filtered.filter(
        (session) =>
          session.status ===
          "ACTIVE",
      );

    const totalRevenue =
      completed.reduce(
        (sum, session) =>
          sum +
          session.totalPrice,
        0,
      );

    let noirShare = 0;
    let cafeShare = 0;

    for (const session of completed) {
      const config = session.cafeId
        ? cafeMap.get(
            session.cafeId,
          )
        : undefined;

      const noirPercent =
        config?.revenueShareNoir ??
        70;

      const cafePercent =
        config?.revenueShareCafe ??
        30;

      noirShare +=
        session.totalPrice *
        (noirPercent / 100);

      cafeShare +=
        session.totalPrice *
        (cafePercent / 100);
    }

    const summary = {
      totalSessions:
        filtered.length,

      completedSessions:
        completed.length,

      activeSessions:
        active.length,

      totalRevenue,

      noirShare:
        Math.round(noirShare),

      cafeShare:
        Math.round(cafeShare),

      totalMinutes:
        completed.reduce(
          (sum, session) =>
            sum +
            session.totalMinutes,
          0,
        ),
    };

    const dailyMap =
      new Map<
        string,
        {
          date: string;
          sessions: number;
          revenue: number;
          minutes: number;
        }
      >();

    for (const session of completed) {
      if (!session.startedAt) {
        continue;
      }

      const date = new Date(
        session.startedAt,
      );

      const key =
        localDateKey(date);

      const current =
        dailyMap.get(key) ?? {
          date: key,
          sessions: 0,
          revenue: 0,
          minutes: 0,
        };

      current.sessions += 1;
      current.revenue +=
        session.totalPrice;
      current.minutes +=
        session.totalMinutes;

      dailyMap.set(
        key,
        current,
      );
    }

    const daily =
      Array.from(
        dailyMap.values(),
      ).sort((a, b) =>
        a.date.localeCompare(
          b.date,
        ),
      );

    const deviceMap =
      new Map<
        string,
        {
          deviceId: string;
          cafeId: string | null;
          sessions: number;
          revenue: number;
          minutes: number;
        }
      >();

    for (const session of completed) {
      const key =
        `${session.cafeId ?? "none"}:${session.deviceId}`;

      const current =
        deviceMap.get(key) ?? {
          deviceId:
            session.deviceId,
          cafeId:
            session.cafeId,
          sessions: 0,
          revenue: 0,
          minutes: 0,
        };

      current.sessions += 1;
      current.revenue +=
        session.totalPrice;
      current.minutes +=
        session.totalMinutes;

      deviceMap.set(
        key,
        current,
      );
    }

    const byDevice =
      Array.from(
        deviceMap.values(),
      ).sort(
        (a, b) =>
          b.revenue -
          a.revenue,
      );

    const byCafeMap =
      new Map<
        string,
        {
          cafeId: string;
          cafeName: string;
          sessions: number;
          revenue: number;
          noirShare: number;
          cafeShare: number;
          minutes: number;
        }
      >();

    for (const session of completed) {
      const cafeId =
        session.cafeId ??
        "unassigned";

      const config =
        cafeMap.get(cafeId);

      const cafeName =
        config?.name ??
        cafeId;

      const noirPercent =
        config?.revenueShareNoir ??
        70;

      const cafePercent =
        config?.revenueShareCafe ??
        30;

      const current =
        byCafeMap.get(cafeId) ?? {
          cafeId,
          cafeName,
          sessions: 0,
          revenue: 0,
          noirShare: 0,
          cafeShare: 0,
          minutes: 0,
        };

      current.sessions += 1;

      current.revenue +=
        session.totalPrice;

      current.noirShare +=
        session.totalPrice *
        (noirPercent / 100);

      current.cafeShare +=
        session.totalPrice *
        (cafePercent / 100);

      current.minutes +=
        session.totalMinutes;

      byCafeMap.set(
        cafeId,
        current,
      );
    }

    const byCafe =
      Array.from(
        byCafeMap.values(),
      )
        .map((item) => ({
          ...item,
          noirShare:
            Math.round(
              item.noirShare,
            ),
          cafeShare:
            Math.round(
              item.cafeShare,
            ),
        }))
        .sort(
          (a, b) =>
            b.revenue -
            a.revenue,
        );

    return Response.json({
      success: true,
      period,
      cafeFilter,
      summary,
      daily,
      byDevice,
      byCafe,
      sessions:
        filtered.slice(
          0,
          period === "history"
            ? 150
            : 50,
        ),
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

function getRange(
  period: string,
  now: Date,
) {
  const end =
    now.getTime();

  if (period === "history") {
    return {
      start: new Date(
        "2020-01-01T00:00:00.000Z",
      ).getTime(),
      end,
    };
  }

  if (period === "monthly") {
    return {
      start: new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).getTime(),
      end,
    };
  }

  if (period === "30-days") {
    return {
      start:
        end -
        29 *
          24 *
          60 *
          60 *
          1000,
      end,
    };
  }

  if (period === "7-days") {
    return {
      start:
        end -
        6 *
          24 *
          60 *
          60 *
          1000,
      end,
    };
  }

  return {
    start: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime(),
    end,
  };
}

function toIso(
  value: unknown,
) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: () => Date;
      }
    ).toDate === "function"
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

function localDateKey(
  date: Date,
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      date.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
