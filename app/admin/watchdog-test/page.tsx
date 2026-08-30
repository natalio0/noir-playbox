"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Power,
  RefreshCw,
  TestTube2,
} from "lucide-react";

import { auth } from "@/lib/firebase";

type DeviceState = {
  switch: boolean;
  countdown: number;
  power: number;
  current: number;
  voltage: number;
};

type PreparingState = {
  id: string;
  deviceId: string;
  status: string;
  startedAt: string | null;
};

type LogItem = {
  time: string;
  title: string;
  detail: string;
  type: "success" | "error" | "info";
};

const DEVICE_ID = "PS01";

export default function WatchdogTestPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [deviceOnline, setDeviceOnline] = useState<boolean | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [preparing, setPreparing] = useState<PreparingState | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [nowMs, setNowMs] = useState(0);

  const addLog = useCallback(
    (type: LogItem["type"], title: string, detail: string) => {
      setLogs((current) => [
        {
          time: new Date().toLocaleTimeString("id-ID"),
          title,
          detail,
          type,
        },
        ...current,
      ]);
    },
    [],
  );

  async function getFreshToken() {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Belum login. Login sebagai admin terlebih dahulu.");
    }

    return user.getIdToken(true);
  }

  const refreshState = useCallback(async () => {
    try {
      setLoadingAction("status");

      const token = await getFreshToken();

      const [deviceResponse, preparingResponse] = await Promise.all([
        fetch(`/api/tuya/device/${DEVICE_ID}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(
          `/api/preparing/active?deviceId=${encodeURIComponent(DEVICE_ID)}`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      ]);

      const deviceData = await deviceResponse.json();
      const preparingData = await preparingResponse.json();

      if (!deviceResponse.ok || !deviceData.success) {
        throw new Error(deviceData.error || "Gagal mengambil status device");
      }

      if (!preparingResponse.ok || !preparingData.success) {
        throw new Error(preparingData.error || "Gagal mengambil PREPARING");
      }

      setDeviceOnline(deviceData.online !== false);
      setDeviceState(deviceData.state ?? null);
      setPreparing(
        preparingData.active
          ? (preparingData.preparing as PreparingState)
          : null,
      );

      setNowMs(Date.now());

      addLog(
        "info",
        "Refresh status",
        `switch_1=${String(deviceData.state?.switch ?? false)}, preparing=${
          preparingData.active ? "ACTIVE" : "NONE"
        }`,
      );
    } catch (error) {
      addLog(
        "error",
        "Refresh gagal",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setLoadingAction(null);
    }
  }, [addLog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNowMs(Date.now());
      void refreshState();
    }, 0);

    const clock = setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);

    return () => {
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [refreshState]);

  async function powerOn() {
    try {
      setLoadingAction("on");

      const token = await getFreshToken();

      const response = await fetch("/api/tuya/control", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: DEVICE_ID,
          action: "ON",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal menyalakan PS01");
      }

      const activePreparingResponse = await fetch(
        `/api/preparing/active?deviceId=${encodeURIComponent(DEVICE_ID)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const activePreparingData = await activePreparingResponse.json();

      if (!activePreparingResponse.ok || !activePreparingData.success) {
        throw new Error(
          activePreparingData.error || "Gagal mengecek PREPARING",
        );
      }

      if (!activePreparingData.active) {
        const preparingResponse = await fetch("/api/preparing/start", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            deviceId: DEVICE_ID,
          }),
        });

        const preparingData = await preparingResponse.json();

        if (!preparingResponse.ok || !preparingData.success) {
          throw new Error(
            preparingData.error || "PS01 ON tetapi PREPARING gagal dibuat",
          );
        }
      }

      addLog(
        "success",
        "PS01 ON + PREPARING",
        "Smart plug dinyalakan dan PREPARING normal dipastikan aktif.",
      );

      await sleep(800);
      await refreshState();
    } catch (error) {
      addLog(
        "error",
        "POWER ON gagal",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function agePreparing() {
    try {
      setLoadingAction("age");

      const token = await getFreshToken();

      const response = await fetch("/api/dev/test-preparing/age", {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: DEVICE_ID,
          minutesAgo: 61,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Gagal mengubah PREPARING menjadi 61 menit",
        );
      }

      addLog(
        "success",
        "PREPARING → 61 menit",
        `Preparing ID: ${data.preparingId}`,
      );

      await refreshState();
    } catch (error) {
      addLog(
        "error",
        "Set 61 menit gagal",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function runWatchdog() {
    try {
      setLoadingAction("watchdog");

      const token = await getFreshToken();

      const response = await fetch("/api/admin/preparing-watchdog", {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Watchdog gagal");
      }

      const detail =
        `checked=${data.checked}, ` +
        `autoShutdown=${data.autoShutdown}, ` +
        `failed=${data.failed}, ` +
        `skipped=${data.skipped}`;

      addLog(
        data.failed > 0 ? "error" : "success",
        data.failed > 0 ? "Watchdog selesai dengan error" : "Watchdog selesai",
        detail,
      );

      if (Array.isArray(data.details)) {
        for (const item of data.details) {
          addLog(
            item.result === "AUTO_SHUTDOWN"
              ? "success"
              : item.result === "SKIPPED"
                ? "info"
                : "error",
            `${item.deviceId}: ${item.result}`,
            item.message ?? item.preparingId ?? "",
          );
        }
      }

      await sleep(1600);
      await refreshState();
    } catch (error) {
      addLog(
        "error",
        "Watchdog gagal",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  const isOn = deviceOnline === true && deviceState?.switch === true;

  const preparingMinutes =
    preparing?.startedAt && nowMs > 0
      ? Math.max(
          0,
          Math.floor(
            (nowMs - new Date(preparing.startedAt).getTime()) / 60_000,
          ),
        )
      : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-600">
              <TestTube2 size={20} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Development Test
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Preparing Watchdog Test V2
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Menguji flow asli: ON → PREPARING → 61 menit → auto OFF.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali ke Admin
          </Link>
        </div>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle
              className="mt-0.5 shrink-0 text-amber-600"
              size={20}
            />
            <div>
              <p className="text-sm font-bold text-amber-800">
                Smart plug benar-benar akan dimatikan
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-700">
                Jangan jalankan saat PS01 sedang dipakai customer.
              </p>
            </div>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatusCard
              label="Device"
              value={
                deviceOnline === null
                  ? "CHECKING"
                  : deviceOnline === false
                    ? "OFFLINE"
                    : isOn
                      ? "ON"
                      : "OFF"
              }
            />

            <StatusCard
              label="Preparing"
              value={preparing ? "ACTIVE" : "NONE"}
            />

            <StatusCard
              label="Elapsed"
              value={
                preparingMinutes === null ? "-" : `${preparingMinutes} min`
              }
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionButton
              label="1. POWER ON"
              loading={loadingAction === "on"}
              disabled={loadingAction !== null}
              onClick={powerOn}
              icon={<Power size={18} />}
            />

            <ActionButton
              label="2. SET 61 MENIT"
              loading={loadingAction === "age"}
              disabled={loadingAction !== null}
              onClick={agePreparing}
              icon={<Clock3 size={18} />}
            />

            <ActionButton
              label="3. RUN WATCHDOG"
              loading={loadingAction === "watchdog"}
              disabled={loadingAction !== null}
              onClick={runWatchdog}
              icon={<CheckCircle2 size={18} />}
            />

            <ActionButton
              label="CEK STATUS"
              loading={loadingAction === "status"}
              disabled={loadingAction !== null}
              onClick={refreshState}
              icon={<RefreshCw size={18} />}
            />
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Target test:</p>
            <p className="mt-1 leading-6">
              POWER ON → PREPARING ACTIVE → SET 61 MENIT → RUN WATCHDOG →
              autoShutdown=1 → Device OFF → PREPARING NONE.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Test Log</h2>

            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-xs font-semibold text-slate-400 hover:text-slate-700"
            >
              Clear
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada test.</p>
            ) : (
              logs.map((log, index) => (
                <div
                  key={`${log.time}-${index}`}
                  className={`rounded-xl border p-4 ${
                    log.type === "success"
                      ? "border-emerald-200 bg-emerald-50"
                      : log.type === "error"
                        ? "border-red-200 bg-red-50"
                        : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className={`text-sm font-bold ${
                          log.type === "success"
                            ? "text-emerald-800"
                            : log.type === "error"
                              ? "text-red-800"
                              : "text-slate-700"
                        }`}
                      >
                        {log.title}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-600">
                        {log.detail}
                      </p>
                    </div>

                    <span className="shrink-0 text-[11px] text-slate-400">
                      {log.time}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  loading,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void | Promise<void>;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
