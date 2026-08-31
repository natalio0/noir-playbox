"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import Image from "next/image";

import {
  Activity,
  Clock3,
  Gauge,
  Power,
  RefreshCw,
  WifiOff,
  Zap,
} from "lucide-react";

import { onAuthStateChanged } from "firebase/auth";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import { auth } from "@/lib/firebase";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useSmartPolling } from "@/hooks/useSmartPolling";


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

type RegistryDevice = {
  id: string;
  deviceId: string;
  name: string;
  cafeId: string | null;
  cafeName: string | null;
  tuyaDeviceId: string | null;
  active: boolean;
  brand: string | null;
  model: string | null;
  type: string | null;
};

type RealtimeDevice = {
  id: string;

  status: DeviceStatus;

  online: boolean;

  state: DeviceState | null;

  loading: boolean;

  error: string | null;

  accessDenied: boolean;

  updatedAt: string | null;

  session: ActiveSession | null;
};

/* =========================================================
   PAGE
========================================================= */

export default function RealtimePage() {
  const preferences = useDashboardPreferences();

  const overviewRequestInFlightRef = useRef<Promise<void> | null>(null);
  const overviewLastRequestAtRef = useRef(0);

  const [collapsed, setCollapsed] = useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [authReady, setAuthReady] = useState(false);

  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const [devices, setDevices] = useState<Record<string, RealtimeDevice>>({});

  const [registryDevices, setRegistryDevices] = useState<RegistryDevice[]>([]);

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
     FETCH REALTIME OVERVIEW - BATCH
  ======================================================= */

  const fetchAllDevices = useCallback(
    async (manual = false) => {
      const user = auth.currentUser;

      if (!user) {
        return;
      }

      /*
       * Dedupe:
       * - jika request overview masih berjalan, tunggu request yang sama
       * - auto refresh yang datang <3 detik dari request sebelumnya dilewati
       * - manual refresh boleh melewati cooldown, tetapi tetap tidak overlap
       */
      if (overviewRequestInFlightRef.current) {
        await overviewRequestInFlightRef.current;
        return;
      }

      const now = Date.now();
      const cooldownMs = 3000;

      if (
        !manual &&
        now - overviewLastRequestAtRef.current < cooldownMs
      ) {
        return;
      }

      overviewLastRequestAtRef.current = now;

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
              data.error || "Gagal mengambil realtime overview",
            );
          }

          const registry = (data.registryDevices ?? []) as RegistryDevice[];
          const realtime = (data.devices ?? []) as RealtimeDevice[];

          setRegistryDevices(registry);

          setDevices(() => {
            const next: Record<string, RealtimeDevice> = {};

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

            return next;
          });

          setLastSynced(
            data.updatedAt ? new Date(data.updatedAt) : new Date(),
          );
        } catch (error) {
          console.error("FETCH REALTIME OVERVIEW ERROR:", error);
        } finally {
          setRefreshing(false);
        }
      })();

      overviewRequestInFlightRef.current = requestPromise;

      try {
        await requestPromise;
      } finally {
        if (overviewRequestInFlightRef.current === requestPromise) {
          overviewRequestInFlightRef.current = null;
        }
      }
    },
    [],
  );

  /* =======================================================
     INITIAL FETCH
  ======================================================= */

  useEffect(() => {
    if (!authReady || !auth.currentUser) {
      return;
    }

    const timeout = setTimeout(() => {
      void fetchAllDevices();
    }, 0);

    return () => {
      clearTimeout(timeout);
    };
  }, [authReady, fetchAllDevices]);

  /* =======================================================
     DATA POLLING - SETTINGS CONTROLLED
  ======================================================= */

  useSmartPolling(() => fetchAllDevices(), {
    enabled: authReady && Boolean(auth.currentUser) && preferences.autoRefresh,
    intervalMs: preferences.refreshInterval * 1000,
  });

  /* =======================================================
     LIVE COUNTDOWN 1 DETIK
  ======================================================= */

  useEffect(() => {
    const interval = setInterval(() => {
      setDevices((current) => {
        const next = { ...current };

        for (const [id, device] of Object.entries(current)) {
          /*
           * Session aktif:
           * countdown dihitung dari Firebase timestamp,
           * bukan dikurangi dari countdown Tuya.
           */
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

          /*
           * Tanpa active session, countdown Tuya masih boleh
           * bergerak lokal untuk keperluan monitoring.
           */
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

     Device 403 tidak ditampilkan.
     Ini cocok untuk role operational per cafe.
  ======================================================= */

  const visiblePSBoxes = useMemo(() => {
    return registryDevices.filter((psbox) => {
      const id = String(psbox.deviceId).toUpperCase();

      const realtimeDevice = devices[id];

      return realtimeDevice?.accessDenied !== true;
    });
  }, [devices, registryDevices]);

  /* =======================================================
     SUMMARY
  ======================================================= */

  const summary = useMemo(() => {
    let on = 0;
    let off = 0;
    let offline = 0;

    for (const psbox of visiblePSBoxes) {
      const id = String(psbox.deviceId).toUpperCase();

      const device = devices[id];

      if (!device || device.loading) {
        continue;
      }

      if (device.status === "ON") {
        on += 1;
      } else if (device.status === "OFF") {
        off += 1;
      } else {
        offline += 1;
      }
    }

    return {
      on,
      off,
      offline,
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

        <div className="space-y-6 p-6">
          {/* =================================================
              HEADING
          ================================================= */}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Realtime Monitoring
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Monitor status realtime seluruh unit Noir Playbox.
              </p>
            </div>

            <button
              onClick={() => fetchAllDevices(true)}
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
              STATUS SUMMARY
          ================================================= */}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            {/* ON */}

            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

              <span className="text-sm text-slate-600">ON</span>

              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600">
                {summary.on}
              </span>
            </div>

            {/* OFF */}

            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />

              <span className="text-sm text-slate-600">OFF</span>

              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {summary.off}
              </span>
            </div>

            {/* OFFLINE */}

            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />

              <span className="text-sm text-slate-600">OFFLINE</span>

              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
                {summary.offline}
              </span>
            </div>

            {/* TOTAL */}

            <div className="border-l border-slate-200 pl-5 text-sm text-slate-500">
              Total{" "}
              <span className="font-semibold text-slate-800">
                {visiblePSBoxes.length}
              </span>{" "}
              unit
            </div>

            {/* LAST SYNC */}

            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              <Activity size={14} />

              {refreshing
                ? "Syncing..."
                : lastSynced
                  ? `Last synced ${lastSynced.toLocaleTimeString("id-ID")}`
                  : "Waiting for sync..."}
            </div>
          </div>

          {/* =================================================
              DEVICE CARDS
          ================================================= */}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visiblePSBoxes.map((psbox) => {
              const id = String(psbox.deviceId).toUpperCase();

              const device = devices[id];

              return (
                <DeviceCard
                  key={id}
                  deviceId={id}
                  device={device}
                  compact={preferences.compactCards}
                  showOfflineWarning={preferences.showOfflineWarning}
                />
              );
            })}
          </div>

          {/* =================================================
              NO DEVICE
          ================================================= */}

          {authReady && visiblePSBoxes.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-700">
                Tidak ada device
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Akun ini belum memiliki akses ke unit Playbox.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   DEVICE CARD
========================================================= */

function DeviceCard({
  deviceId,
  device,
  compact,
  showOfflineWarning,
}: {
  deviceId: string;
  device?: RealtimeDevice;
  compact: boolean;
  showOfflineWarning: boolean;
}) {
  const loading = !device || device.loading;

  const status: DeviceStatus = device?.status ?? "OFFLINE";

  const isOn = status === "ON";

  const isOffline = status === "OFFLINE";

  const state = device?.state;

  return (
    <Link
      prefetch={false}
      href={`/realtime/${deviceId}`}
      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      {/* HEADER */}

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            PlayBox
          </p>

          <h2 className="mt-1 text-xl font-bold text-slate-900">{deviceId}</h2>
        </div>

        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            loading
              ? "bg-slate-100 text-slate-500"
              : isOffline
                ? "bg-amber-50 text-amber-600"
                : isOn
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-600"
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

      {/* PS4 IMAGE */}

      <div
        className={`relative mt-5 overflow-hidden rounded-xl border ${
          isOffline
            ? "border-amber-100 bg-amber-50/70"
            : isOn
              ? "border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50"
              : "border-slate-100 bg-gradient-to-br from-slate-50 via-white to-slate-100"
        }`}
      >
        {/* decorative glow */}
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
            isOffline
              ? "bg-amber-200/40"
              : isOn
                ? "bg-blue-200/50"
                : "bg-slate-200/60"
          }`}
        />

        <div
          className={`relative flex items-center justify-center px-5 ${
            compact ? "h-[110px] py-3" : "h-[165px] py-4"
          }`}
        >
          <Image
            src="/images/ps4.png"
            alt={`PlayStation 4 ${deviceId}`}
            width={320}
            height={180}
            priority={deviceId === "PS01"}
            className={`h-auto ${
              compact ? "max-h-[82px]" : "max-h-[135px]"
            } w-auto max-w-[90%] object-contain drop-shadow-[0_18px_20px_rgba(15,23,42,0.18)] transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03] ${
              isOffline ? "grayscale opacity-55" : ""
            }`}
          />
        </div>

        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              loading
                ? "animate-pulse bg-slate-400"
                : isOffline
                  ? "bg-amber-500"
                  : isOn
                    ? "bg-emerald-500"
                    : "bg-slate-400"
            }`}
          />
          {loading
            ? "Checking..."
            : isOffline
              ? "Device offline"
              : "PS4 Console"}
        </div>
      </div>

      {/* OFFLINE */}

      {isOffline && !loading && showOfflineWarning ? (
        <div className="mt-3 flex min-h-[82px] flex-col items-center justify-center rounded-xl bg-amber-50 p-4 text-center">
          <WifiOff size={21} className="text-amber-500" />

          <p className="mt-2 text-sm font-semibold text-amber-700">
            Device Offline
          </p>

          <p className="mt-1 text-xs text-amber-600">
            Cek listrik dan koneksi Wi-Fi BARDI Smart Plug.
          </p>
        </div>
      ) : (
        <>
          {/* DATA */}

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

          {/* CURRENT */}

          {!loading && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-400">Current</span>

              <span className="text-xs font-semibold text-slate-600">
                {formatNumber(state?.current ?? 0)} mA
              </span>
            </div>
          )}
        </>
      )}

      {/* OPEN */}

      <div className="mt-5 border-t border-slate-100 pt-4 text-right">
        <span className="text-xs font-semibold text-blue-600 transition group-hover:text-blue-700">
          Open Detail →
        </span>
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
   CALCULATE FIREBASE SESSION COUNTDOWN
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
