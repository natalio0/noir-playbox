"use client";

import {
  Activity,
  Clock3,
  Receipt,
  RefreshCw,
  Timer,
  WalletCards,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import CafeFilter, {
  type CafeOption,
} from "@/components/admin/CafeFilter";
import { auth } from "@/lib/firebase";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useSmartPolling } from "@/hooks/useSmartPolling";

type Period =
  | "daily"
  | "7-days"
  | "30-days";

type AnalyticsData = {
  success: boolean;
  error?: string;
  summary: {
    totalSessions: number;
    completedSessions: number;
    activeSessions: number;
    totalRevenue: number;
    noirShare: number;
    cafeShare: number;
    totalMinutes: number;
  };
  daily: Array<{
    date: string;
    sessions: number;
    revenue: number;
    minutes: number;
  }>;
  byDevice: Array<{
    deviceId: string;
    cafeId: string | null;
    sessions: number;
    revenue: number;
    minutes: number;
  }>;
  sessions: Array<{
    id: string;
    deviceId: string;
    cafeId: string | null;
    status:
      | "ACTIVE"
      | "COMPLETED";
    startedAt: string | null;
    totalPrice: number;
  }>;
};

type CafesResponse = {
  success: boolean;
  cafes: CafeOption[];
};

export default function AdminAnalyticsPage({
  period,
  title,
  description,
}: {
  period: Period;
  title: string;
  description: string;
}) {
  const preferences =
    useDashboardPreferences();

  const [collapsed, setCollapsed] =
    useState(false);

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const [cafeId, setCafeId] =
    useState("all");

  const [cafes, setCafes] =
    useState<CafeOption[]>([]);

  const [data, setData] =
    useState<AnalyticsData | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const fetchCafes =
    useCallback(async () => {
      const user =
        auth.currentUser;

      if (!user) {
        return;
      }

      const token =
        await user.getIdToken();

      const response =
        await fetch(
          "/api/admin/cafes",
          {
            cache: "no-store",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          },
        );

      const result =
        (await response.json()) as CafesResponse;

      if (
        response.ok &&
        result.success
      ) {
        setCafes(
          result.cafes ?? [],
        );
      }
    }, []);

  const fetchData =
    useCallback(
      async (
        manual = false,
      ) => {
        try {
          if (manual) {
            setRefreshing(true);
          }

          const user =
            auth.currentUser;

          if (!user) {
            throw new Error(
              "User belum login",
            );
          }

          const token =
            await user.getIdToken();

          const response =
            await fetch(
              `/api/admin/session-analytics?period=${period}&cafeId=${encodeURIComponent(cafeId)}`,
              {
                cache:
                  "no-store",
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },
              },
            );

          const result =
            (await response.json()) as AnalyticsData;

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.error ||
                "Gagal mengambil analytics",
            );
          }

          setData(result);
          setError(null);
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Gagal mengambil analytics",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [cafeId, period],
    );

  /* Cafe list hanya perlu diambil saat komponen mount. */
  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchCafes();
    }, 0);

    return () => clearTimeout(timeout);
  }, [fetchCafes]);

  /* Analytics refresh saat period/cafe berubah. */
  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchData();
    }, 0);

    return () => clearTimeout(timeout);
  }, [fetchData]);

  /*
   * Analytics agregat tidak perlu polling seagresif realtime monitoring.
   * Minimal 60 detik mengurangi Firestore reads saat halaman dibiarkan terbuka.
   */
  useSmartPolling(() => fetchData(), {
    enabled: preferences.autoRefresh,
    intervalMs:
      Math.max(preferences.refreshInterval, 60) * 1000,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() =>
          setCollapsed(
            (prev) => !prev,
          )
        }
        mobileOpen={
          mobileSidebarOpen
        }
        onMobileClose={() =>
          setMobileSidebarOpen(
            false,
          )
        }
      />

      <main
        className={`min-h-screen transition-all duration-300 ${
          collapsed
            ? "lg:ml-20"
            : "lg:ml-64"
        }`}
      >
        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(
              (prev) => !prev,
            )
          }
        />

        <div className="space-y-6 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {title}
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <CafeFilter
                value={cafeId}
                cafes={cafes}
                onChange={
                  setCafeId
                }
              />

              <button
                type="button"
                onClick={() =>
                  void fetchData(true)
                }
                disabled={
                  refreshing
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:text-blue-600 disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Metric
              icon={
                <Activity
                  size={19}
                />
              }
              label="Sessions"
              value={`${data?.summary.totalSessions ?? 0}`}
            />

            <Metric
              icon={
                <Receipt
                  size={19}
                />
              }
              label="Gross Revenue"
              value={currency(
                data?.summary.totalRevenue ?? 0,
              )}
            />

            <Metric
              icon={
                <WalletCards
                  size={19}
                />
              }
              label="Noir Share"
              value={currency(
                data?.summary.noirShare ?? 0,
              )}
            />

            <Metric
              icon={
                <WalletCards
                  size={19}
                />
              }
              label="Cafe Share"
              value={currency(
                data?.summary.cafeShare ?? 0,
              )}
            />

            <Metric
              icon={
                <Clock3
                  size={19}
                />
              }
              label="Usage"
              value={duration(
                data?.summary.totalMinutes ?? 0,
              )}
            />

            <Metric
              icon={
                <Timer
                  size={19}
                />
              }
              label="Active"
              value={`${data?.summary.activeSessions ?? 0}`}
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">
              Revenue
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Berdasarkan session
              Firebase COMPLETED.
            </p>

            <div className="mt-6 h-[320px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Loading...
                </div>
              ) : data?.daily.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={
                      data.daily
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={
                        false
                      }
                    />
                    <XAxis
                      dataKey="date"
                      fontSize={11}
                    />
                    <YAxis
                      fontSize={11}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      fill="#2563eb"
                      radius={[
                        6, 6, 0, 0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Belum ada data.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p className="mt-2 text-lg font-bold text-slate-900">
            {value}
          </p>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function currency(
  value: number,
) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function duration(
  minutes: number,
) {
  const safe =
    Math.max(
      0,
      Math.round(minutes),
    );

  const hours =
    Math.floor(
      safe / 60,
    );

  const rest =
    safe % 60;

  if (!hours) {
    return `${rest}m`;
  }

  if (!rest) {
    return `${hours}j`;
  }

  return `${hours}j ${rest}m`;
}
