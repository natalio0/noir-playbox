"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import {
  Activity,
  Boxes,
  Clock3,
  Gauge,
  Power,
  PowerOff,
  RefreshCw,
  Timer,
  WifiOff,
  Zap,
  CheckCircle2,
  Gamepad2,
  Radio,
} from "lucide-react";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import StatCard from "@/components/dashboard/StatCard";

import { auth, db } from "@/lib/firebase";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useSmartPolling } from "@/hooks/useSmartPolling";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* =========================================================
   TYPES
========================================================= */

type DeviceStatus = "ON" | "OFF" | "OFFLINE";

type DeviceState = {
  switch: boolean;
  countdown: number;
  power: number;
  current: number;
  voltage: number;
};

type ActiveSession = {
  id: string;
  deviceId: string;
  status: "ACTIVE" | "COMPLETED";
  startedAt: string | null;
  endedAt: string | null;
  totalMinutes: number;
  totalPrice: number;
};

type DashboardDevice = {
  id: string;
  status: DeviceStatus;
  online: boolean;
  state: DeviceState | null;
  session: ActiveSession | null;
  loading: boolean;
  accessDenied: boolean;
  error: string | null;
  updatedAt: string | null;
};

/* =========================================================
   PAGE
========================================================= */

export default function Home() {
  const preferences = useDashboardPreferences();

  const [collapsed, setCollapsed] = useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [authReady, setAuthReady] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const [devices, setDevices] = useState<Record<string, DashboardDevice>>({});

  const dashboardRequestInFlightRef = useRef<Promise<void> | null>(null);
  const dashboardLastRequestAtRef = useRef(0);

  /* =======================================================
     FIREBASE AUTH READY
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      setAuthReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /* =======================================================
     FETCH DASHBOARD - SHARED BATCH ENDPOINT
  ======================================================= */

  const fetchDashboard = useCallback(
    async (manual = false) => {
      const user = auth.currentUser;

      if (!user) {
        return;
      }

      if (dashboardRequestInFlightRef.current) {
        await dashboardRequestInFlightRef.current;
        return;
      }

      const now = Date.now();
      const cooldownMs = 3000;

      if (
        !manual &&
        now - dashboardLastRequestAtRef.current < cooldownMs
      ) {
        return;
      }

      dashboardLastRequestAtRef.current = now;

      if (manual) {
        setRefreshing(true);
      }

      const requestPromise = (async () => {
        try {
          const idToken = await user.getIdToken();

          const response = await fetch("/api/realtime/overview", {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(
              data.error || "Gagal mengambil dashboard overview",
            );
          }

          const realtime = (data.devices ?? []) as DashboardDevice[];

          const next: Record<string, DashboardDevice> = {};

          for (const device of realtime) {
            const id = String(device.id).toUpperCase();

            next[id] = {
              ...device,
              id,
              state: device.state
                ? {
                    ...device.state,
                    countdown: device.session
                      ? calculateSessionCountdown(device.session)
                      : Math.max(
                          0,
                          Number(device.state.countdown ?? 0),
                        ),
                  }
                : null,
            };
          }

          setDevices(next);
          setLastSynced(
            data.updatedAt ? new Date(data.updatedAt) : new Date(),
          );
        } catch (error) {
          console.error("FETCH DASHBOARD OVERVIEW ERROR:", error);
        } finally {
          setRefreshing(false);
        }
      })();

      dashboardRequestInFlightRef.current = requestPromise;

      try {
        await requestPromise;
      } finally {
        if (dashboardRequestInFlightRef.current === requestPromise) {
          dashboardRequestInFlightRef.current = null;
        }
      }
    },
    [],
  );

  /* =======================================================
     INITIAL FETCH
  ======================================================= */

  useEffect(() => {
    if (!authReady) return;

    const timeout = setTimeout(() => {
      void fetchDashboard();
    }, 0);

    return () => clearTimeout(timeout);
  }, [authReady, fetchDashboard]);

  /* =======================================================
     POLLING TUYA + FIREBASE

     Interval dibuat konservatif agar dashboard tetap responsif tanpa membanjiri API.
  ======================================================= */

  useSmartPolling(() => fetchDashboard(), {
    enabled: authReady && Boolean(auth.currentUser) && preferences.autoRefresh,
    intervalMs: preferences.refreshInterval * 1000,
  });

  /* =======================================================
     LIVE COUNTDOWN 1 DETIK

     Session aktif dihitung dari timestamp Firebase.
  ======================================================= */

  useEffect(() => {
    const interval = setInterval(() => {
      setDevices((current) => {
        const next = { ...current };

        for (const [id, device] of Object.entries(current)) {
          if (device.session?.status === "ACTIVE" && device.state) {
            next[id] = {
              ...device,
              state: {
                ...device.state,
                countdown: calculateSessionCountdown(device.session),
              },
            };

            continue;
          }

          if (
            device.online &&
            device.status === "ON" &&
            device.state &&
            device.state.countdown > 0
          ) {
            next[id] = {
              ...device,
              state: {
                ...device.state,
                countdown: Math.max(0, device.state.countdown - 1),
              },
            };
          }
        }

        return next;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  /* =======================================================
     VISIBLE DEVICES
  ======================================================= */

  const visiblePSBoxes = useMemo(() => {
    return Object.keys(devices)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({ id }));
  }, [devices]);

  /* =======================================================
     REALTIME STATS
  ======================================================= */

  const stats = useMemo(() => {
    let totalUnits = 0;
    let activeUnits = 0;
    let inactiveUnits = 0;
    let offlineUnits = 0;
    let activeSessions = 0;
    let activeBilling = 0;

    for (const psbox of visiblePSBoxes) {
      const id = String(psbox.id).toUpperCase();
      const device = devices[id];

      totalUnits += 1;

      if (!device || device.loading) {
        continue;
      }

      if (device.status === "ON") {
        activeUnits += 1;
      } else if (device.status === "OFF") {
        inactiveUnits += 1;
      } else {
        offlineUnits += 1;
      }

      if (device.session?.status === "ACTIVE") {
        activeSessions += 1;
        activeBilling += Number(device.session.totalPrice ?? 0);
      }
    }

    return {
      totalUnits,
      activeUnits,
      inactiveUnits,
      offlineUnits,
      activeSessions,
      activeBilling,
    };
  }, [devices, visiblePSBoxes]);

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <main
        className={`min-h-screen transition-all duration-300 ${
          collapsed ? "lg:ml-20" : "lg:ml-64"
        }`}
      >
        <Header
          onMenuClick={() => {
            setMobileSidebarOpen((prev) => !prev);
          }}
        />

        <div className="space-y-6 p-4 sm:p-6">
          {/* =================================================
              HEADING
          ================================================== */}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Dashboard Overview
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Live monitoring Noir Playbox dari Firebase dan BARDI/Tuya.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing || !authReady || !auth.currentUser}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin" : ""}
              />

              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* =================================================
              STATS
          ================================================== */}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard
              title="Total Units"
              value={String(stats.totalUnits)}
              description="Registered PlayBox"
              icon={<Boxes size={20} />}
            />

            <StatCard
              title="Currently ON"
              value={String(stats.activeUnits)}
              description="Live from Tuya"
              icon={<Power size={20} />}
            />

            <StatCard
              title="Currently OFF"
              value={String(stats.inactiveUnits)}
              description="Online but switched off"
              icon={<PowerOff size={20} />}
            />

            <StatCard
              title="Offline"
              value={String(stats.offlineUnits)}
              description="Tuya unreachable"
              icon={<WifiOff size={20} />}
            />

            <StatCard
              title="Active Sessions"
              value={String(stats.activeSessions)}
              description="From Firebase"
              icon={<Timer size={20} />}
            />

            <StatCard
              title="Active Billing"
              value={`Rp${stats.activeBilling.toLocaleString("id-ID")}`}
              description="Current active sessions"
              icon={<Clock3 size={20} />}
            />
          </div>

          {/* =================================================
              SYNC STATUS
          ================================================== */}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Activity size={15} className="text-slate-400" />

            <span className="text-xs text-slate-500">
              {refreshing
                ? "Syncing Firebase + Tuya..."
                : lastSynced
                  ? `Last synced ${lastSynced.toLocaleTimeString("id-ID")}`
                  : "Waiting for sync..."}
            </span>
          </div>

          {/* =================================================
              ANALYTICS

              Komponen ini tetap dipertahankan.
              Jika UsageChart / RecentActivity masih mock,
              data grafiknya belum realtime sampai komponen
              tersebut juga diintegrasikan.
          ================================================== */}

          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Analytics
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Usage and recent PlayBox activity
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="min-w-0 xl:col-span-2">
                <UsageChart />
              </div>

              <div className="min-w-0">
                <RecentActivity />
              </div>
            </div>
          </div>

          {/* =================================================
              LIVE PLAYBOX STATUS
          ================================================== */}

          <div>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  PlayBox Status
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Current status dari Tuya dengan active session Firebase.
                </p>
              </div>

              <Link
                prefetch={false}
                href="/realtime"
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Open Realtime →
              </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visiblePSBoxes.map((psbox) => {
                const id = String(psbox.id).toUpperCase();

                return (
                  <DashboardDeviceCard
                    key={id}
                    deviceId={id}
                    device={devices[id]}
                    compact={preferences.compactCards}
                    showOfflineWarning={preferences.showOfflineWarning}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   DEVICE CARD
========================================================= */

function DashboardDeviceCard({
  deviceId,
  device,
  compact,
  showOfflineWarning,
}: {
  deviceId: string;
  device?: DashboardDevice;
  compact: boolean;
  showOfflineWarning: boolean;
}) {
  const loading = !device || device.loading;

  const status: DeviceStatus = device?.status ?? "OFFLINE";

  const isOn = status === "ON";

  const isOffline = status === "OFFLINE";

  const state = device?.state;

  const sessionActive = device?.session?.status === "ACTIVE";

  return (
    <Link
      prefetch={false}
      href={`/realtime/${deviceId}`}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      {/* IMAGE */}

      <div
        className={`relative flex ${
          compact ? "h-[105px]" : "h-[150px]"
        } items-center justify-center overflow-hidden ${
          isOffline
            ? "bg-amber-50"
            : isOn
              ? "bg-gradient-to-br from-blue-50 via-white to-slate-50"
              : "bg-slate-50"
        }`}
      >
        <div
          className={`pointer-events-none absolute h-28 w-28 rounded-full blur-3xl ${
            isOffline
              ? "bg-amber-200/50"
              : isOn
                ? "bg-blue-200/60"
                : "bg-slate-200/60"
          }`}
        />

        <Image
          src="/images/ps4.png"
          alt={`PlayStation 4 ${deviceId}`}
          width={280}
          height={160}
          priority={deviceId === "PS01"}
          className={`relative z-10 h-auto ${
            compact ? "max-h-[78px]" : "max-h-[115px]"
          } w-auto max-w-[85%] object-contain drop-shadow-[0_15px_18px_rgba(15,23,42,0.16)] transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03] ${
            isOffline ? "grayscale opacity-50" : ""
          }`}
        />

        <div
          className={`absolute right-3 top-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${
            loading
              ? "bg-white/90 text-slate-500"
              : isOffline
                ? "bg-amber-50 text-amber-600"
                : isOn
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-white/90 text-slate-600"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              loading
                ? "animate-pulse bg-slate-400"
                : isOffline
                  ? "bg-amber-500"
                  : isOn
                    ? "bg-emerald-500"
                    : "bg-slate-400"
            }`}
          />

          {loading ? "LOADING" : status}
        </div>
      </div>

      {/* CONTENT */}

      <div className={compact ? "p-4" : "p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              PlayBox
            </p>

            <h3 className="mt-1 text-xl font-bold text-slate-900">
              {deviceId}
            </h3>
          </div>

          {sessionActive && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
              Rental Active
            </span>
          )}
        </div>

        {isOffline && !loading && showOfflineWarning ? (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <WifiOff size={16} className="text-amber-500" />

              <p className="text-sm font-semibold text-amber-700">
                Device Offline
              </p>
            </div>

            <p className="mt-1 text-xs text-amber-600">
              BARDI Smart Plug tidak dapat dihubungi.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniValue
              icon={<Power size={15} />}
              label="Switch"
              value={loading ? "..." : isOn ? "ON" : "OFF"}
            />

            <MiniValue
              icon={<Clock3 size={15} />}
              label="Countdown"
              value={loading ? "..." : formatCountdown(state?.countdown ?? 0)}
            />

            <MiniValue
              icon={<Zap size={15} />}
              label="Power"
              value={loading ? "..." : `${formatNumber(state?.power ?? 0)} W`}
            />

            <MiniValue
              icon={<Gauge size={15} />}
              label="Voltage"
              value={
                loading ? "..." : `${formatVoltage(state?.voltage ?? 0)} V`
              }
            />
          </div>
        )}

        {sessionActive && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5">
            <span className="text-xs font-medium text-blue-600">Billing</span>

            <span className="text-sm font-bold text-blue-700">
              Rp
              {Number(device?.session?.totalPrice ?? 0).toLocaleString("id-ID")}
            </span>
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4 text-right">
          <span className="text-xs font-semibold text-blue-600 transition group-hover:text-blue-700">
            Open Detail →
          </span>
        </div>
      </div>
    </Link>
  );
}

/* =========================================================
   MINI VALUE
========================================================= */

function MiniValue({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}

        <span className="text-[11px] font-medium">{label}</span>
      </div>

      <p className="mt-2 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

/* =========================================================
   USAGE CHART - FIRESTORE REALTIME
========================================================= */

type SessionRealtimeRow = {
  id: string;
  deviceId: string;
  status: "ACTIVE" | "COMPLETED";
  startedAt: unknown;
  endedAt: unknown;
  totalMinutes: number;
  totalPrice: number;
};

type UsageChartRow = {
  day: string;
  usageMinutes: number;
  sessions: number;
};

function UsageChart() {
  const [sessions, setSessions] = useState<SessionRealtimeRow[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

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
          ...(doc.data() as Omit<SessionRealtimeRow, "id">),
        }));

        setSessions(rows);
        setLoadingChart(false);
      },
      (error) => {
        console.error("USAGE CHART FIRESTORE ERROR:", error);
        setLoadingChart(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const chartData = useMemo(() => {
    const days: UsageChartRow[] = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);

      days.push({
        day: date.toLocaleDateString("id-ID", {
          weekday: "short",
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

  const totalMinutes = useMemo(
    () => chartData.reduce((total, row) => total + row.usageMinutes, 0),
    [chartData],
  );

  const totalSessions = useMemo(
    () => chartData.reduce((total, row) => total + row.sessions, 0),
    [chartData],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Usage — 7 Hari
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            Realtime berdasarkan session Firebase
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">
            {formatUsageMinutes(totalMinutes)}
          </p>

          <p className="text-[11px] text-slate-400">Total usage</p>
        </div>
      </div>

      <div className="mt-5 h-[260px]">
        {loadingChart ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Memuat data Firebase...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />

              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tickFormatter={(value) => `${value}m`}
              />

              <Tooltip
                formatter={(value, name) => {
                  if (name === "usageMinutes" || name === "Usage") {
                    return [formatUsageMinutes(Number(value)), "Usage"];
                  }

                  return [String(value), String(name)];
                }}
                labelFormatter={(label) => `Hari ${label}`}
              />

              <Bar dataKey="usageMinutes" name="Usage" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <div>
          <p className="text-[11px] text-slate-400">Sessions 7 hari</p>

          <p className="mt-1 text-sm font-bold text-slate-700">
            {totalSessions}
          </p>
        </div>

        <div>
          <p className="text-[11px] text-slate-400">Hari ini</p>

          <p className="mt-1 text-sm font-bold text-slate-700">
            {formatUsageMinutes(chartData.at(-1)?.usageMinutes ?? 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   RECENT ACTIVITY - FIRESTORE REALTIME
========================================================= */

function RecentActivity() {
  const [sessions, setSessions] = useState<SessionRealtimeRow[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    const sessionsQuery = query(
      collection(db, "sessions"),
      orderBy("startedAt", "desc"),
      limit(8),
    );

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<SessionRealtimeRow, "id">),
        }));

        setSessions(rows);
        setLoadingActivity(false);
      },
      (error) => {
        console.error("RECENT ACTIVITY FIRESTORE ERROR:", error);
        setLoadingActivity(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const activeCount = useMemo(
    () => sessions.filter((session) => session.status === "ACTIVE").length,
    [sessions],
  );

  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Recent Activity
          </h3>

          <p className="mt-1 text-xs text-slate-500">Live dari Firebase</p>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">
          <Radio size={11} />
          LIVE
        </div>
      </div>

      <div className="px-5 py-3">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Active sessions</span>

          <span className="text-xs font-bold text-slate-800">
            {activeCount}
          </span>
        </div>
      </div>

      <div className="max-h-[310px] divide-y divide-slate-100 overflow-y-auto">
        {loadingActivity ? (
          <div className="p-6 text-center text-sm text-slate-400">
            Memuat activity...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            Belum ada aktivitas session.
          </div>
        ) : (
          sessions.map((session) => {
            const active = session.status === "ACTIVE";
            const startedAtMs = timestampToMs(session.startedAt);

            return (
              <div key={session.id} className="flex gap-3 px-5 py-4">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {active ? <Gamepad2 size={17} /> : <CheckCircle2 size={17} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {session.deviceId || "PlayBox"}
                      </p>

                      <p
                        className={`mt-0.5 text-xs font-medium ${
                          active ? "text-emerald-600" : "text-slate-500"
                        }`}
                      >
                        {active ? "Rental sedang berjalan" : "Session selesai"}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        active
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock3 size={11} />
                      {formatUsageMinutes(session.totalMinutes)}
                    </span>

                    <span>
                      Rp
                      {Number(session.totalPrice ?? 0).toLocaleString("id-ID")}
                    </span>

                    <span>
                      {startedAtMs ? formatRelativeTime(startedAtMs) : "-"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* =========================================================
   FIRESTORE TIMESTAMP HELPERS
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

  if (typeof value === "object") {
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

function getCalendarDayDifference(from: Date, to: Date) {
  const fromDay = new Date(from);
  fromDay.setHours(0, 0, 0, 0);

  const toDay = new Date(to);
  toDay.setHours(0, 0, 0, 0);

  return Math.round((toDay.getTime() - fromDay.getTime()) / 86_400_000);
}

function formatUsageMinutes(minutes: number) {
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

function formatRelativeTime(timestampMs: number) {
  const diff = Date.now() - timestampMs;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) {
    return "baru saja";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} menit lalu`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} jam lalu`;
  }

  const days = Math.floor(hours / 24);

  return `${days} hari lalu`;
}

/* =========================================================
   FIREBASE COUNTDOWN
========================================================= */

function calculateSessionCountdown(session: ActiveSession | null) {
  if (!session || session.status !== "ACTIVE" || !session.startedAt) {
    return 0;
  }

  const startedAtMs = new Date(session.startedAt).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return 0;
  }

  const totalSeconds = Math.max(0, Number(session.totalMinutes || 0) * 60);

  const endAtMs = startedAtMs + totalSeconds * 1000;

  const remainingSeconds = Math.ceil((endAtMs - Date.now()) / 1000);

  return Math.max(0, remainingSeconds);
}

/* =========================================================
   FORMAT COUNTDOWN
========================================================= */

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));

  const hours = Math.floor(safeSeconds / 3600);

  const minutes = Math.floor((safeSeconds % 3600) / 60);

  const seconds = safeSeconds % 60;

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");
}

/* =========================================================
   FORMAT NUMBER
========================================================= */

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });
}

/* =========================================================
   FORMAT VOLTAGE
========================================================= */

function formatVoltage(value: number) {
  return (Number(value || 0) / 10).toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
