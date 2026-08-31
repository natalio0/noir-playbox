"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Activity, Clock3 } from "lucide-react";

import { db } from "@/lib/firebase";

type SessionRow = {
  id: string;
  deviceId: string;
  status: "ACTIVE" | "COMPLETED";
  startedAt: unknown;
  endedAt: unknown;
  totalMinutes: number;
  totalPrice: number;
};

type ChartRow = {
  day: string;
  fullDate: string;
  usageMinutes: number;
  sessions: number;
};

export default function UsageChart() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================================================
     FIRESTORE REALTIME
  ========================================================= */

  useEffect(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const sessionsQuery = query(
      collection(db, "sessions"),
      where("startedAt", ">=", sevenDaysAgo),
      orderBy("startedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<SessionRow, "id">),
        }));

        setSessions(rows);
        setLoading(false);
      },

      (error) => {
        console.error("USAGE CHART FIRESTORE ERROR:", error);

        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  /* =========================================================
     CHART DATA
  ========================================================= */

  const chartData = useMemo(() => {
    const days: ChartRow[] = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);

      date.setDate(date.getDate() - offset);

      days.push({
        day: date.toLocaleDateString("id-ID", {
          weekday: "short",
        }),

        fullDate: date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
        }),

        usageMinutes: 0,

        sessions: 0,
      });
    }

    for (const session of sessions) {
      const startedAtMs = timestampToMs(session.startedAt);

      if (!startedAtMs) {
        continue;
      }

      const startedAt = new Date(startedAtMs);

      const diffDays = getCalendarDayDifference(startedAt, new Date());

      if (diffDays < 0 || diffDays > 6) {
        continue;
      }

      const index = 6 - diffDays;

      days[index].usageMinutes += Math.max(
        0,
        Number(session.totalMinutes ?? 0),
      );

      days[index].sessions += 1;
    }

    return days;
  }, [sessions]);

  /* =========================================================
     SUMMARY
  ========================================================= */

  const summary = useMemo(() => {
    const totalMinutes = chartData.reduce(
      (total, row) => total + row.usageMinutes,
      0,
    );

    const totalSessions = chartData.reduce(
      (total, row) => total + row.sessions,
      0,
    );

    const todayUsage = chartData[chartData.length - 1]?.usageMinutes ?? 0;

    const averageUsage =
      chartData.length > 0 ? Math.round(totalMinutes / chartData.length) : 0;

    return {
      totalMinutes,
      totalSessions,
      todayUsage,
      averageUsage,
    };
  }, [chartData]);

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* HEADER */}

      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Activity size={18} />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Usage Analytics
            </h3>

            <p className="mt-0.5 text-xs text-slate-500">
              Penggunaan PlayBox 7 hari terakhir
            </p>
          </div>
        </div>

        <div className="flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          FIREBASE LIVE
        </div>
      </div>

      {/* SUMMARY */}

      <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
        <MiniStat
          label="Total Usage"
          value={formatMinutes(summary.totalMinutes)}
        />

        <MiniStat label="Sessions" value={String(summary.totalSessions)} />

        <MiniStat label="Hari Ini" value={formatMinutes(summary.todayUsage)} />

        <MiniStat
          label="Avg / Hari"
          value={formatMinutes(summary.averageUsage)}
        />
      </div>

      {/* CHART */}

      <div className="p-4 sm:p-6">
        <div className="h-[280px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />

                <p className="text-xs text-slate-400">Memuat Firebase...</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 10,
                  right: 10,
                  left: -15,
                  bottom: 0,
                }}
                barCategoryGap="30%"
              >
                {/* GRID */}

                <CartesianGrid
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />

                {/* X AXIS */}

                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#94a3b8",
                    fontSize: 11,
                  }}
                  dy={8}
                />

                {/* Y AXIS */}

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#94a3b8",
                    fontSize: 11,
                  }}
                  tickFormatter={(value) => formatYAxis(Number(value))}
                />

                {/* TOOLTIP */}

                <Tooltip
                  cursor={{
                    fill: "#eff6ff",
                  }}
                  content={<CustomTooltip />}
                />

                {/* BLUE BAR */}

                <Bar
                  dataKey="usageMinutes"
                  name="Usage"
                  radius={[8, 8, 3, 3]}
                  maxBarSize={42}
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`${entry.day}-${index}`}
                      fill="#2563eb"
                      style={{
                        fill: "#2563eb",
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* FOOTER */}

        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />

            <span className="text-xs text-slate-500">
              Total penggunaan PlayBox
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock3 size={13} />
            Update realtime
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MINI STAT
========================================================= */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-base font-bold text-slate-800">{value}</p>
    </div>
  );
}

/* =========================================================
   CUSTOM TOOLTIP
========================================================= */

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;

  payload?: Array<{
    payload: ChartRow;
    value: number;
  }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="min-w-[155px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <p className="text-xs font-bold text-slate-800">
        {data.day}, {data.fullDate}
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-6">
          <span className="text-xs text-slate-500">Usage</span>

          <span className="text-xs font-bold text-blue-600">
            {formatMinutes(data.usageMinutes)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-6">
          <span className="text-xs text-slate-500">Sessions</span>

          <span className="text-xs font-bold text-slate-700">
            {data.sessions}
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   TIMESTAMP
========================================================= */

function timestampToMs(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();

    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "object" && value !== null) {
    const timestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };

    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().getTime();
    }

    const seconds = timestamp.seconds ?? timestamp._seconds;

    if (typeof seconds === "number") {
      return seconds * 1000;
    }
  }

  return null;
}

/* =========================================================
   DAY DIFFERENCE
========================================================= */

function getCalendarDayDifference(from: Date, to: Date) {
  const fromDay = new Date(from);

  fromDay.setHours(0, 0, 0, 0);

  const toDay = new Date(to);

  toDay.setHours(0, 0, 0, 0);

  return Math.round((toDay.getTime() - fromDay.getTime()) / 86_400_000);
}

/* =========================================================
   FORMAT MINUTES
========================================================= */

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));

  const hours = Math.floor(safeMinutes / 60);

  const remainingMinutes = safeMinutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes <= 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/* =========================================================
   FORMAT Y AXIS
========================================================= */

function formatYAxis(minutes: number) {
  if (minutes >= 60) {
    const hours = minutes / 60;

    return `${Number(hours.toFixed(1))}h`;
  }

  return `${minutes}m`;
}
