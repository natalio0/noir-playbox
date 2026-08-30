"use client";

import { Clock3, Wifi, WifiOff } from "lucide-react";
import { PSBox } from "@/types/psbox";
import Link from "next/link";

type RealtimeCardProps = {
  psbox: PSBox;
};

function formatElapsed(startedAt?: string) {
  if (!startedAt) return "--";

  const start = new Date(startedAt).getTime();
  const now = Date.now();

  const diff = Math.max(0, now - start);

  const totalMinutes = Math.floor(diff / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

export default function RealtimeCard({ psbox }: RealtimeCardProps) {
  const isOn = psbox.status === "ON";
  const isOffline = psbox.status === "OFFLINE";

  return (
    <Link
      href={`/realtime/${psbox.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            PlayBox
          </p>

          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {psbox.name}
          </h2>
        </div>

        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            isOn
              ? "bg-emerald-50 text-emerald-600"
              : isOffline
                ? "bg-red-50 text-red-600"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isOn
                ? "bg-emerald-500"
                : isOffline
                  ? "bg-red-500"
                  : "bg-slate-400"
            }`}
          />

          {psbox.status}
        </div>
      </div>

      {/* Current session */}
      <div className="mt-8 rounded-lg bg-slate-50 p-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Clock3 size={16} />
          Current Session
        </div>

        <p className="mt-2 text-3xl font-bold text-slate-900">
          {isOn ? formatElapsed(psbox.currentSessionStartedAt) : "--"}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          {isOn ? "PlayBox is currently running" : "No active session"}
        </p>
      </div>

      {/* Information */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-400">Today&apos;s Usage</p>

          <p className="mt-1 text-sm font-semibold text-slate-800">
            {Math.floor(psbox.todayUsageMinutes / 60)}h{" "}
            {psbox.todayUsageMinutes % 60}m
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-400">Last Activity</p>

          <p className="mt-1 text-sm font-semibold text-slate-800">
            {psbox.lastActivity}
          </p>
        </div>
      </div>

      {/* Connection */}
      <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs">
        {isOffline ? (
          <>
            <WifiOff size={15} className="text-red-500" />

            <span className="text-red-500">Device connection lost</span>
          </>
        ) : (
          <>
            <Wifi size={15} className="text-emerald-500" />

            <span className="text-slate-500">Device connected</span>
          </>
        )}
      </div>
    </Link>
  );
}
