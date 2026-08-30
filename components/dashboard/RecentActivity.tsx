"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { CheckCircle2, Clock3, Gamepad2, Radio } from "lucide-react";

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

export default function RecentActivity() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

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
          ...(doc.data() as Omit<SessionRow, "id">),
        }));

        setSessions(rows);
        setLoading(false);
      },
      (error) => {
        console.error("RECENT ACTIVITY FIRESTORE ERROR:", error);
        setLoading(false);
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
        {loading ? (
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

                      {formatMinutes(session.totalMinutes)}
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

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));

  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes} menit`;
  }

  if (remainingMinutes <= 0) {
    return `${hours} jam`;
  }

  return `${hours}j ${remainingMinutes}m`;
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
