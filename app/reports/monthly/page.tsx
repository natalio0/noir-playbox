"use client";

import { Printer, Receipt } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { auth } from "@/lib/firebase";
import { getCafeDisplayName } from "@/lib/cafes";

type ReportData = {
  success: boolean;
  error?: string;
  summary: {
    totalSessions: number;
    completedSessions: number;
    activeSessions: number;
    totalRevenue: number;
    totalMinutes: number;
  };
  byDevice: Array<{
    deviceId: string;
    sessions: number;
    revenue: number;
    minutes: number;
  }>;
  byCafe: Array<{
    cafeId: string;
    sessions: number;
    revenue: number;
    minutes: number;
  }>;
};

export default function MonthlyReportPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const user = auth.currentUser;

      if (!user) throw new Error("User belum login");

      const token = await user.getIdToken();

      const response = await fetch(
        "/api/admin/session-analytics?period=monthly",
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const result = (await response.json()) as ReportData;

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal mengambil monthly report");
      }

      setData(result);
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil monthly report",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timeout);
  }, [load]);

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
          onMenuClick={() =>
            setMobileSidebarOpen((prev) => !prev)
          }
        />

        <div className="space-y-6 p-4 sm:p-6 print:p-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Monthly Report
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Rekap bulan berjalan berdasarkan session COMPLETED.
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 print:hidden"
            >
              <Printer size={16} />
              Print Report
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Loading monthly report...
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card
                  label="Completed Sessions"
                  value={`${data?.summary.completedSessions ?? 0}`}
                />
                <Card
                  label="Revenue"
                  value={`Rp${(data?.summary.totalRevenue ?? 0).toLocaleString("id-ID")}`}
                />
                <Card
                  label="Usage"
                  value={duration(data?.summary.totalMinutes ?? 0)}
                />
                <Card
                  label="Active Now"
                  value={`${data?.summary.activeSessions ?? 0}`}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <ReportTable
                  title="Per Cafe"
                  firstLabel="Cafe"
                  rows={(data?.byCafe ?? []).map((item) => ({
                    name: getCafeDisplayName(item.cafeId),
                    sessions: item.sessions,
                    usage: duration(item.minutes),
                    revenue: item.revenue,
                  }))}
                />

                <ReportTable
                  title="Per PlayBox"
                  firstLabel="PlayBox"
                  rows={(data?.byDevice ?? []).map((item) => ({
                    name: item.deviceId,
                    sessions: item.sessions,
                    usage: duration(item.minutes),
                    revenue: item.revenue,
                  }))}
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Receipt size={14} />
                Revenue dikunci dari session Firebase berstatus COMPLETED.
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ReportTable({
  title,
  firstLabel,
  rows,
}: {
  title: string;
  firstLabel: string;
  rows: Array<{
    name: string;
    sessions: number;
    usage: string;
    revenue: number;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900">
          {title}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              {[firstLabel, "Sessions", "Usage", "Revenue"].map(
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
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.name}>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {row.sessions}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {row.usage}
                  </td>
                  <td className="px-5 py-4 font-semibold text-blue-600">
                    Rp{row.revenue.toLocaleString("id-ID")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-8 text-center text-sm text-slate-400"
                >
                  Belum ada data bulan ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function duration(minutes: number) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const remaining = safe % 60;

  if (!hours) return `${remaining}m`;
  if (!remaining) return `${hours}j`;

  return `${hours}j ${remaining}m`;
}
