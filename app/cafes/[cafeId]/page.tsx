"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Clock3,
  Gamepad2,
  Receipt,
  RefreshCw,
  Timer,
  WalletCards,
} from "lucide-react";
import {
  use,
  useCallback,
  useEffect,
  useState,
} from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { auth } from "@/lib/firebase";
import AddPlayBoxDialog from "@/components/admin/AddPlayBoxDialog";

type CafeDetail = {
  success: boolean;
  error?: string;

  cafe: {
    id: string;
    name: string;
    active: boolean;
    revenueShareNoir: number;
    revenueShareCafe: number;
  };

  summary: {
    totalDevices: number;
    activeSessions: number;
    completedSessionsThisMonth: number;
    grossRevenue: number;
    noirShare: number;
    cafeShare: number;
    totalMinutes: number;
  };

  devices: Array<{
    deviceId: string;
    sessions: number;
    revenue: number;
    minutes: number;
    activeNow: boolean;
  }>;

  recentSessions: Array<{
    id: string;
    deviceId: string;
    status:
      | "ACTIVE"
      | "COMPLETED";
    startedAt: string | null;
    endedAt: string | null;
    totalMinutes: number;
    totalPrice: number;
  }>;

  generatedAt: string;
};

export default function CafeDetailPage({
  params,
}: {
  params: Promise<{
    cafeId: string;
  }>;
}) {
  const { cafeId } =
    use(params);

  const [collapsed, setCollapsed] =
    useState(false);

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const [data, setData] =
    useState<CafeDetail | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const load =
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
              `/api/admin/cafes/${encodeURIComponent(cafeId)}`,
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
            (await response.json()) as CafeDetail;

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.error ||
                "Gagal mengambil detail cafe",
            );
          }

          setData(result);
          setError(null);
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Gagal mengambil detail cafe",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [cafeId],
    );

  useEffect(() => {
    const timeout =
      setTimeout(() => {
        void load();
      }, 0);

    return () =>
      clearTimeout(timeout);
  }, [load]);

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
              <Link
                href="/cafes"
                className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
              >
                <ArrowLeft
                  size={16}
                />
                Semua Cafe
              </Link>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Building2
                    size={21}
                  />
                </div>

                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {data?.cafe.name ??
                      cafeId}
                  </h1>

                  <p className="mt-1 text-sm text-slate-500">
                    Dashboard performa
                    cafe bulan berjalan.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {data?.cafe && (
                <AddPlayBoxDialog
                  cafeId={data.cafe.id}
                  cafeName={data.cafe.name}
                  onCreated={() => void load(true)}
                />
              )}

              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:text-blue-600 disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
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

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              Loading cafe...
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <Metric
                  icon={
                    <Gamepad2
                      size={19}
                    />
                  }
                  label="Units"
                  value={`${data?.summary.totalDevices ?? 0}`}
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

                <Metric
                  icon={
                    <Receipt
                      size={19}
                    />
                  }
                  label="Gross"
                  value={currency(
                    data?.summary.grossRevenue ?? 0,
                  )}
                />

                <Metric
                  icon={
                    <WalletCards
                      size={19}
                    />
                  }
                  label={`Noir ${data?.cafe.revenueShareNoir ?? 70}%`}
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
                  label={`Cafe ${data?.cafe.revenueShareCafe ?? 30}%`}
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
              </div>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                  <h2 className="font-semibold text-slate-900">
                    PlayBox Units
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Performa masing-masing
                    unit bulan ini.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        {[
                          "Unit",
                          "Status",
                          "Sessions",
                          "Usage",
                          "Revenue",
                        ].map(
                          (label) => (
                            <th
                              key={label}
                              className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                            >
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {data?.devices.length ? (
                        data.devices.map(
                          (device) => (
                            <tr
                              key={
                                device.deviceId
                              }
                            >
                              <td className="px-5 py-4 font-semibold text-slate-900">
                                <Link
                                  href={`/realtime/${device.deviceId}`}
                                  className="hover:text-blue-600"
                                >
                                  {
                                    device.deviceId
                                  }
                                </Link>
                              </td>

                              <td className="px-5 py-4">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                    device.activeNow
                                      ? "bg-emerald-50 text-emerald-600"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {device.activeNow
                                    ? "ACTIVE"
                                    : "IDLE"}
                                </span>
                              </td>

                              <td className="px-5 py-4 text-sm text-slate-600">
                                {
                                  device.sessions
                                }
                              </td>

                              <td className="px-5 py-4 text-sm text-slate-600">
                                {duration(
                                  device.minutes,
                                )}
                              </td>

                              <td className="px-5 py-4 font-semibold text-blue-600">
                                {currency(
                                  device.revenue,
                                )}
                              </td>
                            </tr>
                          ),
                        )
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-8 text-center text-sm text-slate-400"
                          >
                            Belum ada
                            device.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                  <h2 className="font-semibold text-slate-900">
                    Recent Sessions
                  </h2>
                </div>

                <div className="divide-y divide-slate-100">
                  {data?.recentSessions.length ? (
                    data.recentSessions.map(
                      (session) => (
                        <div
                          key={
                            session.id
                          }
                          className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">
                                {
                                  session.deviceId
                                }
                              </p>

                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  session.status ===
                                  "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {
                                  session.status
                                }
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-slate-400">
                              {dateTime(
                                session.startedAt,
                              )}
                              {" · "}
                              {duration(
                                session.totalMinutes,
                              )}
                            </p>
                          </div>

                          <p className="font-bold text-slate-800">
                            {currency(
                              session.totalPrice,
                            )}
                          </p>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="p-6 text-sm text-slate-400">
                      Belum ada session.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
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

  const remaining =
    safe % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  if (!remaining) {
    return `${hours}j`;
  }

  return `${hours}j ${remaining}m`;
}

function dateTime(
  value: string | null,
) {
  if (!value) {
    return "-";
  }

  return new Date(
    value,
  ).toLocaleString(
    "id-ID",
    {
      dateStyle:
        "medium",
      timeStyle:
        "short",
    },
  );
}
