import { Clock3, Circle } from "lucide-react";

import { PSBox } from "@/types/psbox";

type PsBoxCardProps = {
  psbox: PSBox;
};

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hours}h ${mins}m`;
}

export default function PsBoxCard({ psbox }: PsBoxCardProps) {
  const isOnline = psbox.status === "ON";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            PlayBox
          </p>

          <h3 className="mt-1 text-lg font-bold text-slate-900">
            {psbox.name}
          </h3>
        </div>

        <div
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            isOnline
              ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <Circle size={8} fill="currentColor" />

          {psbox.status}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs text-slate-400">Today&apos;s Usage</p>

        <p className="mt-1 text-2xl font-bold text-slate-900">
          {formatMinutes(psbox.todayUsageMinutes)}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock3 size={15} />

          {psbox.status === "ON" ? "Currently running" : "Not running"}
        </div>

        <span className="text-xs text-slate-400">{psbox.lastActivity}</span>
      </div>
    </div>
  );
}
