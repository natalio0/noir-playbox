"use client";

import { History, Receipt } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { auth } from "@/lib/firebase";
import { getCafeDisplayName } from "@/lib/cafes";

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

type ResponseData = {
  success: boolean;
  error?: string;
  sessions: SessionRow[];
};

export default function HistoryPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const user = auth.currentUser;

      if (!user) throw new Error("User belum login");

      const token = await user.getIdToken();

      const response = await fetch(
        "/api/admin/session-analytics?period=history",
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = (await response.json()) as ResponseData;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal mengambil history");
      }

      setSessions(data.sessions ?? []);
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil history",
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

        <div className="space-y-6 p-4 sm:p-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Session History
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Riwayat session Firebase seluruh PlayBox.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Session",
                      "PlayBox",
                      "Cafe",
                      "Start",
                      "End",
                      "Duration",
                      "Billing",
                      "Status",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-8 text-center text-sm text-slate-400"
                      >
                        Loading history...
                      </td>
                    </tr>
                  ) : sessions.length ? (
                    sessions.map((session) => (
                      <tr key={session.id}>
                        <td className="max-w-[160px] truncate px-5 py-4 text-xs text-slate-400">
                          {session.id}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {session.deviceId}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {getCafeDisplayName(session.cafeId)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                          {dateTime(session.startedAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                          {dateTime(session.endedAt)}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {duration(session.totalMinutes)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-800">
                          Rp{session.totalPrice.toLocaleString("id-ID")}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              session.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {session.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-8 text-center text-sm text-slate-400"
                      >
                        Belum ada session.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <History size={14} />
            Menampilkan maksimal 150 session terbaru.
            <Receipt size={14} className="ml-2" />
            Billing berasal dari Firebase session.
          </div>
        </div>
      </main>
    </div>
  );
}

function dateTime(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function duration(minutes: number) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const remaining = safe % 60;

  if (!hours) return `${remaining}m`;
  if (!remaining) return `${hours}j`;

  return `${hours}j ${remaining}m`;
}
