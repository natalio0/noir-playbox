"use client";

import {
  Activity,
  AlertTriangle,
  Clock3,
  Power,
  ShieldAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { auth } from "@/lib/firebase";
import { getCafeDisplayName } from "@/lib/cafes";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useSmartPolling } from "@/hooks/useSmartPolling";

type RiskLevel =
  | "NORMAL"
  | "WARNING"
  | "SUSPICIOUS";

type PreparingAlert = {
  id: string;
  deviceId: string;
  cafeId: string;
  operatorUid: string | null;
  operatorEmail: string | null;
  startedAt: string | null;
  elapsedMinutes: number;
  riskLevel: RiskLevel;
};

type ShutdownAlert = {
  id: string;
  deviceId: string;
  cafeId: string;
  sourceSessionId: string | null;
  startedAt: string | null;
  elapsedMinutes: number;
};

type EndedWithoutBilling = {
  id: string;
  deviceId: string;
  cafeId: string;
  durationMinutes: number;
  riskLevel: RiskLevel;
  operatorUid: string | null;
  createdAt: string | null;
};

type AlertResponse = {
  success: boolean;
  error?: string;
  generatedAt: string;
  summary: {
    preparingTotal: number;
    preparingWarning: number;
    preparingSuspicious: number;
    shutdownActive: number;
    endedWithoutBilling: number;
  };
  preparing: PreparingAlert[];
  shutdown: ShutdownAlert[];
  endedWithoutBilling: EndedWithoutBilling[];
};

export default function AdminPage() {
  const preferences = useDashboardPreferences();

  const [collapsed, setCollapsed] =
    useState(false);

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const [data, setData] =
    useState<AlertResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken =
        await user.getIdToken();

      const response = await fetch(
        "/api/admin/alerts",
        {
          cache: "no-store",
          headers: {
            Authorization:
              `Bearer ${idToken}`,
          },
        },
      );

      const result =
        (await response.json()) as AlertResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Gagal mengambil admin alerts",
        );
      }

      setData(result);
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil admin alerts",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchAlerts();
    }, 0);

    return () =>
      clearTimeout(timeout);
  }, [fetchAlerts]);

  useSmartPolling(() => fetchAlerts(), {
    enabled: preferences.autoRefresh,
    intervalMs: preferences.refreshInterval * 1000,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() =>
          setCollapsed((prev) => !prev)
        }
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() =>
          setMobileSidebarOpen(false)
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

        <div className="space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Admin Monitoring
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Monitoring PREPARING,
              unbilled usage, dan shutdown
              operational.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              icon={
                <Clock3 size={19} />
              }
              label="Preparing"
              value={
                data?.summary
                  .preparingTotal ?? 0
              }
            />

            <SummaryCard
              icon={
                <AlertTriangle
                  size={19}
                />
              }
              label="Warning >45m"
              value={
                data?.summary
                  .preparingWarning ?? 0
              }
            />

            <SummaryCard
              icon={
                <ShieldAlert
                  size={19}
                />
              }
              label="Suspicious >60m"
              value={
                data?.summary
                  .preparingSuspicious ?? 0
              }
            />

            <SummaryCard
              icon={<Power size={19} />}
              label="Shutdown Active"
              value={
                data?.summary
                  .shutdownActive ?? 0
              }
            />

            <SummaryCard
              icon={
                <Activity size={19} />
              }
              label="Ended No Billing"
              value={
                data?.summary
                  .endedWithoutBilling ?? 0
              }
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">
                Preparing Alerts
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                PREPARING lebih dari 45 menit
                masuk warning dan lebih dari 60
                menit masuk suspicious.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                <EmptyRow text="Loading..." />
              ) : (
                data?.preparing.length
                  ? data.preparing.map(
                      (item) => (
                        <PreparingRow
                          key={item.id}
                          item={item}
                        />
                      ),
                    )
                  : (
                    <EmptyRow text="Tidak ada PREPARING aktif." />
                  )
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">
                Shutdown Mode Active
              </h2>
            </div>

            <div className="divide-y divide-slate-100">
              {data?.shutdown.length ? (
                data.shutdown.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.deviceId}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Cafe: {getCafeDisplayName(item.cafeId)}
                      </p>
                    </div>

                    <div className="text-sm font-semibold text-violet-600">
                      {item.elapsedMinutes} menit
                    </div>
                  </div>
                ))
              ) : (
                <EmptyRow text="Tidak ada Shutdown Mode aktif." />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">
                Ended Without Billing
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Riwayat monitor yang pernah masuk
                PREPARING lalu selesai tanpa
                membuat billing.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {data?.endedWithoutBilling
                .length ? (
                data.endedWithoutBilling.map(
                  (item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.deviceId}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Cafe: {getCafeDisplayName(item.cafeId)}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {formatDateTime(
                            item.createdAt,
                          )}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-sm font-semibold text-slate-800">
                          {
                            item.durationMinutes
                          }{" "}
                          menit
                        </p>

                        <RiskBadge
                          level={
                            item.riskLevel
                          }
                        />
                      </div>
                    </div>
                  ),
                )
              ) : (
                <EmptyRow text="Belum ada riwayat tanpa billing." />
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function PreparingRow({
  item,
}: {
  item: PreparingAlert;
}) {
  return (
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">
            {item.deviceId}
          </p>

          <RiskBadge
            level={item.riskLevel}
          />
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Cafe: {getCafeDisplayName(item.cafeId)}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          Start:{" "}
          {formatDateTime(
            item.startedAt,
          )}
        </p>
      </div>

      <div className="text-left sm:text-right">
        <p className="text-xl font-bold text-slate-900">
          {item.elapsedMinutes} menit
        </p>

        <p className="mt-1 text-xs text-slate-400">
          belum ada billing
        </p>
      </div>
    </div>
  );
}

function RiskBadge({
  level,
}: {
  level: RiskLevel;
}) {
  const className =
    level === "SUSPICIOUS"
      ? "bg-red-50 text-red-600"
      : level === "WARNING"
        ? "bg-amber-50 text-amber-600"
        : "bg-emerald-50 text-emerald-600";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${className}`}
    >
      {level}
    </span>
  );
}

function EmptyRow({
  text,
}: {
  text: string;
}) {
  return (
    <div className="p-5 text-sm text-slate-400">
      {text}
    </div>
  );
}

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(
    "id-ID",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}
