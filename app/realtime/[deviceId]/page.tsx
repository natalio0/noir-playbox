"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  Clock3,
  Power,
  Activity,
  Zap,
  Gauge,
  Plus,
  Receipt,
} from "lucide-react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import { auth } from "@/lib/firebase";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useSmartPolling } from "@/hooks/useSmartPolling";
import { TUYA_API_SAVER_DETAIL_INTERVAL_MS } from "@/lib/tuya-api-saver";
import {
  completeShutdownMode,
  endPreparingWithoutBilling,
  getActivePreparingSession,
  getActiveShutdownSession,
  getPreparingRisk,
  getShutdownElapsedMinutes,
  startPreparingSession,
  startShutdownMode,
  type PreparingSession,
  type ShutdownSession,
} from "@/lib/preparing";

import { RENTAL_PACKAGES } from "@/lib/rental-packages";

/* =========================================================
   PACKAGES
========================================================= */

const PACKAGES = RENTAL_PACKAGES;

/* =========================================================
   TYPES
========================================================= */

type DeviceState = {
  switch: boolean;
  countdown: number;
  power: number;
  current: number;
  voltage: number;
};

type SessionPackage = {
  id: string;
  name: string;
  durationMinutes: number;
  durationSeconds?: number;
  price: number;
  type?: "INITIAL" | "ADD_TIME";
  addedAt: string | null;
};

type Session = {
  id: string;
  deviceId: string;
  status: "ACTIVE" | "COMPLETED";
  startedAt: string | null;
  endedAt: string | null;
  totalMinutes: number;
  totalPrice: number;
};

const TUYA_REFRESH_MIN_GAP_MS = 3_000;
const TUYA_VERIFY_DELAY_MS = 1_200;
const TUYA_ACTION_POLL_PAUSE_MS = 4_000;

/* =========================================================
   PAGE
========================================================= */

export default function PSDetailPage({
  params,
}: {
  params: Promise<{
    deviceId: string;
  }>;
}) {
  const preferences = useDashboardPreferences();

  /* =======================================================
     BASIC STATE
  ======================================================= */

  const [collapsed, setCollapsed] = useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [rawDeviceId, setRawDeviceId] = useState("");

  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);

  const [deviceOnline, setDeviceOnline] = useState<boolean | null>(null);

  const [liveCountdown, setLiveCountdown] = useState(0);

  const [loading, setLoading] = useState(true);

  const [controlLoading, setControlLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /* =======================================================
     SESSION
  ======================================================= */

  const [session, setSession] = useState<Session | null>(null);

  const [sessionPackages, setSessionPackages] = useState<SessionPackage[]>([]);

  const [restoringSession, setRestoringSession] = useState(true);

  const [completingSession, setCompletingSession] = useState(false);

  const [preparing, setPreparing] = useState<PreparingSession | null>(null);

  const [shutdownMode, setShutdownMode] = useState<ShutdownSession | null>(
    null,
  );

  const [preparingNow, setPreparingNow] = useState(0);

  /* =======================================================
     REFS
  ======================================================= */

  const sessionRef = useRef<Session | null>(null);

  const completingRef = useRef(false);

  const expiryStopRef = useRef(false);

  const countdownRef = useRef(0);
  const idempotencyKeysRef = useRef<Record<string, string>>({});

  const getIdempotencyKey = useCallback((scope: string) => {
    const existing = idempotencyKeysRef.current[scope];
    if (existing) return existing;
    const key = crypto.randomUUID();
    idempotencyKeysRef.current[scope] = key;
    return key;
  }, []);

  const clearIdempotencyKey = useCallback((scope: string) => {
    delete idempotencyKeysRef.current[scope];
  }, []);

  const lastTuyaSyncRef = useRef<number>(0);

  /*
   * Dedupe status Tuya:
   * - hanya satu GET /api/tuya/device yang boleh in-flight
   * - polling biasa tidak boleh menembak lagi <3 detik setelah request terakhir
   * - setiap aksi Tuya mem-pause polling 4 detik
   * - verification setelah command memakai satu timer yang bisa diganti
   */
  const tuyaFetchInFlightRef = useRef<Promise<void> | null>(null);
  const tuyaFetchAbortControllerRef = useRef<AbortController | null>(null);
  const lastTuyaRequestAtRef = useRef<number>(0);
  const tuyaPollingPausedUntilRef = useRef<number>(0);
  const tuyaVerificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleExpiredSessionRef = useRef<(sessionId: string) => void>(() => {});

  /* =======================================================
     SYNC SESSION REF
  ======================================================= */

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /* =======================================================
     GET DEVICE ID
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    params.then((value) => {
      if (mounted) {
        setRawDeviceId(value.deviceId);
      }
    });

    return () => {
      mounted = false;
    };
  }, [params]);

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  function showNotification(
    type: "success" | "error" | "warning",
    message: string,
  ) {
    setNotification({
      type,
      message,
    });

    setTimeout(() => {
      setNotification(null);
    }, 4000);
  }
  /* =======================================================
     RESTORE ACTIVE SESSION
  ======================================================= */

  const restoreActiveSession = useCallback(async (deviceId: string) => {
    try {
      setRestoringSession(true);

      console.log("=================================");
      console.log("🔥 RESTORE ACTIVE SESSION");
      console.log("DEVICE:", deviceId);
      console.log("=================================");

      /*
       * Firebase Authentication
       *
       * Endpoint session juga nantinya membutuhkan
       * authentication.
       */

      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken = await user.getIdToken();

      const response = await fetch(
        `/api/sessions/active?deviceId=${encodeURIComponent(deviceId)}&includePackages=1`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const data = await response.json();

      console.log("ACTIVE SESSION RESPONSE:", data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal mengambil active session");
      }

      if (!data.active || !data.session) {
        sessionRef.current = null;
        setSession(null);
        setSessionPackages([]);
        countdownRef.current = 0;
        setLiveCountdown(0);
        console.log("Tidak ada active session");
        return;
      }

      const restoredSession = data.session as Session;

      const restoredPackages = (data.packages ?? []) as SessionPackage[];

      sessionRef.current = restoredSession;

      expiryStopRef.current = false;

      setSession(restoredSession);

      setSessionPackages(restoredPackages);

      const firebaseCountdown = calculateSessionCountdown(restoredSession);
      countdownRef.current = firebaseCountdown;
      setLiveCountdown(firebaseCountdown);

      console.log("🔥 SESSION RESTORED:", restoredSession.id);

      console.log("PACKAGES:", restoredPackages);
    } catch (error) {
      console.error("RESTORE SESSION ERROR:", error);

      setError(
        error instanceof Error ? error.message : "Gagal restore session",
      );
    } finally {
      setRestoringSession(false);
    }
  }, []);

  const pauseTuyaPolling = useCallback(
    (durationMs = TUYA_ACTION_POLL_PAUSE_MS) => {
      tuyaPollingPausedUntilRef.current = Math.max(
        tuyaPollingPausedUntilRef.current,
        Date.now() + durationMs,
      );
    },
    [],
  );

  const beginTuyaActionWindow = useCallback(() => {
    /*
     * Dipanggil sinkron di baris paling awal setiap operasi.
     *
     * Selain mem-pause polling baru, batalkan monitoring GET yang mungkin
     * sudah mulai beberapa milidetik sebelum operator menekan tombol.
     * Ini menutup race "PATCH complete -> GET Tuya -> POST STOP".
     */
    pauseTuyaPolling(TUYA_ACTION_POLL_PAUSE_MS);

    if (tuyaVerificationTimerRef.current) {
      clearTimeout(tuyaVerificationTimerRef.current);
      tuyaVerificationTimerRef.current = null;
    }

    const controller = tuyaFetchAbortControllerRef.current;

    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }, [pauseTuyaPolling]);

  /* =======================================================
     FETCH TUYA
  ======================================================= */

  const fetchDeviceState = useCallback(
    async (deviceId: string, options?: { force?: boolean }) => {
      if (!deviceId) {
        return;
      }

      /*
       * Kalau request status yang sama masih berjalan, tunggu request itu
       * daripada membuat GET baru.
       */
      if (tuyaFetchInFlightRef.current) {
        await tuyaFetchInFlightRef.current;
        return;
      }

      const now = Date.now();

      /*
       * Setelah aksi Tuya, polling reguler dipause sementara.
       * Verification command memakai force=true sehingga tetap boleh jalan.
       */
      if (!options?.force && now < tuyaPollingPausedUntilRef.current) {
        return;
      }

      /*
       * Smart polling/focus refresh tidak perlu memukul Tuya lagi bila baru
       * saja ada sync. Verification command memakai force=true.
       */
      if (
        !options?.force &&
        now - lastTuyaRequestAtRef.current < TUYA_REFRESH_MIN_GAP_MS
      ) {
        return;
      }

      lastTuyaRequestAtRef.current = now;

      const controller = new AbortController();
      tuyaFetchAbortControllerRef.current = controller;

      const request = (async () => {
        try {
          const user = auth.currentUser;

          if (!user) {
            throw new Error("User belum login");
          }

          const idToken = await user.getIdToken();

          const response = await fetch(`/api/tuya/device/${deviceId}`, {
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            const message = String(
              data.error ?? "Gagal mengambil status device",
            );

            if (
              message.toLowerCase().includes("offline") ||
              message.includes("40000801")
            ) {
              setDeviceOnline(false);
              setDeviceState(null);

              if (!sessionRef.current) {
                countdownRef.current = 0;
                setLiveCountdown(0);
              }

              setError(null);
              return;
            }

            throw new Error(message);
          }

          if (data.online === false || !data.state) {
            setDeviceOnline(false);
            setDeviceState(null);

            if (!sessionRef.current) {
              countdownRef.current = 0;
              setLiveCountdown(0);
            }

            setError(null);
            return;
          }

          setDeviceOnline(true);

          const state = data.state as DeviceState;
          setDeviceState(state);

          const activeSession = sessionRef.current;
          const countdown = activeSession
            ? calculateSessionCountdown(activeSession)
            : Math.max(0, Number(state.countdown ?? 0));

          countdownRef.current = countdown;
          setLiveCountdown(countdown);
          lastTuyaSyncRef.current = Date.now();
          setError(null);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          console.error("FETCH DEVICE ERROR:", error);

          setError(
            error instanceof Error
              ? error.message
              : "Gagal mengambil status device",
          );
        } finally {
          if (tuyaFetchAbortControllerRef.current === controller) {
            tuyaFetchAbortControllerRef.current = null;
          }

          setLoading(false);
        }
      })();

      tuyaFetchInFlightRef.current = request;

      try {
        await request;
      } finally {
        if (tuyaFetchInFlightRef.current === request) {
          tuyaFetchInFlightRef.current = null;
        }
      }
    },
    [],
  );

  const scheduleTuyaVerification = useCallback(
    (deviceId: string, delayMs = TUYA_VERIFY_DELAY_MS) => {
      if (!deviceId) {
        return;
      }

      /*
       * Satu aksi = satu verification. Selama window ini polling reguler
       * tidak boleh membuat GET tambahan yang berdekatan.
       */
      pauseTuyaPolling(TUYA_ACTION_POLL_PAUSE_MS);

      if (tuyaVerificationTimerRef.current) {
        clearTimeout(tuyaVerificationTimerRef.current);
      }

      tuyaVerificationTimerRef.current = setTimeout(() => {
        tuyaVerificationTimerRef.current = null;
        void fetchDeviceState(deviceId, { force: true });
      }, delayMs);
    },
    [fetchDeviceState, pauseTuyaPolling],
  );

  useEffect(() => {
    return () => {
      if (tuyaVerificationTimerRef.current) {
        clearTimeout(tuyaVerificationTimerRef.current);
      }

      tuyaFetchAbortControllerRef.current?.abort();
    };
  }, []);

  /* =======================================================
     RESTORE + INITIAL TUYA
  ======================================================= */

  useEffect(() => {
    if (!rawDeviceId) {
      return;
    }

    const initialize = async () => {
      /*
       * Session Firebase dan status Tuya tidak saling menunggu.
       * Ini memangkas initial detail load karena dua network request jalan
       * paralel. restoreActiveSession tetap akan menimpa countdown dengan
       * Firebase bila ada billing aktif.
       */
      await Promise.allSettled([
        restoreActiveSession(rawDeviceId),
        fetchDeviceState(rawDeviceId, { force: true }),
      ]);
    };

    void initialize();
  }, [rawDeviceId, restoreActiveSession, fetchDeviceState]);

  /* =======================================================
     RESTORE PREPARING SESSION
  ======================================================= */

  useEffect(() => {
    if (!rawDeviceId) {
      return;
    }

    let cancelled = false;

    getActivePreparingSession(rawDeviceId)
      .then((activePreparing) => {
        if (!cancelled) {
          setPreparing(activePreparing);
        }
      })
      .catch((error) => {
        console.error("RESTORE PREPARING ERROR:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [rawDeviceId]);

  /* =======================================================
     RESTORE SHUTDOWN MODE
  ======================================================= */

  useEffect(() => {
    if (!rawDeviceId) {
      return;
    }

    let cancelled = false;

    getActiveShutdownSession(rawDeviceId)
      .then((activeShutdown) => {
        if (!cancelled) {
          setShutdownMode(activeShutdown);
        }
      })
      .catch((error) => {
        console.error("RESTORE SHUTDOWN ERROR:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [rawDeviceId]);

  /* =======================================================
     PREPARING CLOCK
  ======================================================= */

  useEffect(() => {
    const updatePreparingNow = () => {
      setPreparingNow(Date.now());
    };

    const timeout = setTimeout(updatePreparingNow, 0);
    const interval = setInterval(updatePreparingNow, 30_000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  /* =======================================================
     TUYA POLLING
  ======================================================= */

  useSmartPolling(() => fetchDeviceState(rawDeviceId), {
    enabled: Boolean(rawDeviceId) && preferences.autoRefresh,
    intervalMs: preferences.tuyaApiSaver
      ? TUYA_API_SAVER_DETAIL_INTERVAL_MS
      : preferences.refreshInterval * 1000,
  });

  /* =======================================================
     SESSION EXPIRED

     Firebase adalah source of truth untuk waktu rental.
     Saat countdown Firebase mencapai 0:
     1. Complete session Firebase + buat SHUTDOWN_PENDING.
     2. Kirim STOP ke BARDI/Tuya sebagai best-effort background.
  ======================================================= */

  async function handleExpiredSession(sessionId: string) {
    if (expiryStopRef.current || completingRef.current) {
      return;
    }

    expiryStopRef.current = true;
    beginTuyaActionWindow();

    try {
      /*
       * Firebase-first, sama seperti tombol STOP manual. COMPLETE langsung
       * membuat SHUTDOWN_PENDING persistent; BARDI STOP hanya best-effort dan
       * tidak boleh menahan penyelesaian billing.
       */
      await completeSession(sessionId);

      setDeviceState((current) =>
        current
          ? {
              ...current,
              switch: false,
              countdown: 0,
            }
          : current,
      );
      countdownRef.current = 0;
      setLiveCountdown(0);

      showNotification(
        "success",
        "Waktu rental habis. Billing selesai dan shutdown pending tersimpan.",
      );

      void (async () => {
        try {
          pauseTuyaPolling();

          const user = auth.currentUser;

          if (!user) {
            return;
          }

          const idToken = await user.getIdToken();
          const stopResponse = await fetch("/api/tuya/control", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              deviceId: rawDeviceId,
              action: "STOP",
            }),
          });

          const stopData = await stopResponse.json();

          if (!stopResponse.ok || !stopData.success) {
            throw new Error(
              String(
                stopData.error ??
                  stopData.message ??
                  "Gagal mematikan BARDI",
              ),
            );
          }
          scheduleTuyaVerification(rawDeviceId);
        } catch (stopError) {
          console.error("AUTO STOP TUYA ERROR:", stopError);

          showNotification(
            "warning",
            "Billing sudah selesai, tetapi BARDI belum dapat dikonfirmasi OFF. Shutdown pending tetap tersimpan.",
          );
        }
      })();
    } catch (error) {
      console.error("SESSION EXPIRY ERROR:", error);

      expiryStopRef.current = false;

      showNotification(
        "error",
        error instanceof Error
          ? error.message
          : "Gagal menyelesaikan session yang habis",
      );
    }
  }

  useEffect(() => {
    handleExpiredSessionRef.current = (sessionId: string) => {
      void handleExpiredSession(sessionId);
    };
  });

  /* =======================================================
     LOCAL COUNTDOWN
  ======================================================= */

  useEffect(() => {
    const interval = setInterval(() => {
      const activeSession = sessionRef.current;

      if (activeSession?.status === "ACTIVE") {
        const remaining = calculateSessionCountdown(activeSession);

        countdownRef.current = remaining;
        setLiveCountdown(remaining);

        if (remaining <= 0 && !expiryStopRef.current) {
          handleExpiredSessionRef.current(activeSession.id);
        }

        return;
      }

      if (!deviceState?.switch) {
        return;
      }

      if (countdownRef.current <= 0) {
        return;
      }

      countdownRef.current = Math.max(0, countdownRef.current - 1);
      setLiveCountdown(countdownRef.current);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [deviceState?.switch]);

  /* =======================================================
     COMPLETE SESSION
  ======================================================= */

  async function completeSession(sessionId: string) {
    if (completingRef.current) {
      return null;
    }

    completingRef.current = true;
    setCompletingSession(true);

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken = await user.getIdToken();

      const response = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          deviceId: rawDeviceId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal complete session");
      }

      /*
       * Firebase sudah menjadi source of truth. Begitu COMPLETE sukses,
       * UI billing langsung ditutup tanpa menunggu round-trip Tuya.
       */
      if (data.shutdown) {
        setShutdownMode(data.shutdown as ShutdownSession);
      }

      sessionRef.current = null;
      expiryStopRef.current = false;
      setSession(null);
      setSessionPackages([]);
      setLiveCountdown(0);
      countdownRef.current = 0;

      return data;
    } catch (error) {
      console.error("COMPLETE SESSION ERROR:", error);

      setError(
        error instanceof Error ? error.message : "Gagal complete session",
      );

      throw error;
    } finally {
      completingRef.current = false;
      setCompletingSession(false);
    }
  }

  /* =======================================================
     CREATE SESSION
  ======================================================= */

  async function createSession(pkg: (typeof PACKAGES)[number]) {
    const user = auth.currentUser;
    const scope = `START:${rawDeviceId}:${preparing?.id ?? ""}:${pkg.id}`;
    const idempotencyKey = getIdempotencyKey(scope);

    if (!user) {
      throw new Error("User belum login");
    }

    const idToken = await user.getIdToken();

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        deviceId: rawDeviceId,
        preparingId: preparing?.id ?? null,
        idempotencyKey,
        packageId: pkg.id,
        durationMinutes: pkg.durationMinutes,
        packageName: pkg.name,
        price: pkg.price,
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.session) {
      throw new Error(data.error || "Gagal membuat session");
    }

    clearIdempotencyKey(scope);
    return {
      session: data.session as Session,
      package: (data.package ?? null) as SessionPackage | null,
      preparingConverted: Boolean(data.preparingConverted),
    };
  }

  /* =======================================================
     ADD PACKAGE FIREBASE
  ======================================================= */

  async function addPackageToFirebase(
    sessionId: string,
    pkg: (typeof PACKAGES)[number],
  ) {
    const user = auth.currentUser;
    const scope = `ADD:${sessionId}:${pkg.id}`;
    const idempotencyKey = getIdempotencyKey(scope);

    if (!user) {
      throw new Error("User belum login");
    }

    const idToken = await user.getIdToken();

    const response = await fetch(`/api/sessions/${sessionId}/packages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        deviceId: rawDeviceId,
        idempotencyKey,
        packageId: pkg.id,
        name: pkg.name,
        durationMinutes: pkg.durationMinutes,
        price: pkg.price,
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.session || !data.package) {
      throw new Error(data.error || "Gagal menyimpan package");
    }

    clearIdempotencyKey(scope);
    return {
      package: data.package as SessionPackage,
      totalMinutes: Number(data.session.totalMinutes ?? 0),
      totalPrice: Number(data.session.totalPrice ?? 0),
    };
  }

  /* =======================================================
     SHUTDOWN MODE CONTROL
  ======================================================= */

  async function startOperationalShutdownMode() {
    if (!rawDeviceId || shutdownMode?.status !== "SHUTDOWN_PENDING") {
      return;
    }

    beginTuyaActionWindow();

    try {
      setControlLoading(true);
      setError(null);

      /*
       * FIREBASE FIRST:
       * catat SHUTDOWN_ACTIVE lebih dulu. Dengan begitu refresh/logout di
       * tengah proses tidak pernah menghilangkan state shutdown.
       */
      const createdShutdown = await startShutdownMode(
        rawDeviceId,
        shutdownMode.sourceSessionId,
      );

      setShutdownMode(createdShutdown);

      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken = await user.getIdToken();

      /*
       * Setelah audit persistent, baru nyalakan monitor.
       * Tidak membuat PREPARING dan tidak membuat billing.
       */

      const response = await fetch("/api/tuya/control", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          deviceId: rawDeviceId,
          action: "ON",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Shutdown sudah tercatat, tetapi monitor gagal dinyalakan",
        );
      }

      setDeviceOnline(true);

      setDeviceState((current) =>
        current
          ? {
              ...current,
              switch: true,
              countdown: 0,
            }
          : {
              switch: true,
              countdown: 0,
              power: 0,
              current: 0,
              voltage: 0,
            },
      );

      showNotification(
        "success",
        "Shutdown Mode aktif. Monitor dinyalakan untuk mematikan PS4 secara normal.",
      );

      scheduleTuyaVerification(rawDeviceId);
    } catch (error) {
      console.error("START SHUTDOWN MODE ERROR:", error);

      setError(
        error instanceof Error ? error.message : "Gagal memulai Shutdown Mode",
      );
    } finally {
      setControlLoading(false);
    }
  }

  async function retryShutdownMonitorOn() {
    if (!rawDeviceId || shutdownMode?.status !== "SHUTDOWN_ACTIVE") {
      return;
    }

    beginTuyaActionWindow();

    try {
      setControlLoading(true);
      setError(null);

      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken = await user.getIdToken();

      const response = await fetch("/api/tuya/control", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          deviceId: rawDeviceId,
          action: "ON",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal menyalakan monitor");
      }

      setDeviceOnline(true);
      setDeviceState((current) =>
        current
          ? {
              ...current,
              switch: true,
              countdown: 0,
            }
          : {
              switch: true,
              countdown: 0,
              power: 0,
              current: 0,
              voltage: 0,
            },
      );

      showNotification(
        "success",
        "Monitor aktif kembali. Silakan matikan PS4 secara normal.",
      );

      scheduleTuyaVerification(rawDeviceId);
    } catch (error) {
      console.error("RETRY SHUTDOWN MONITOR ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Gagal menyalakan monitor untuk Shutdown Mode",
      );
    } finally {
      setControlLoading(false);
    }
  }

  async function verifyTuyaSwitch(expectedOn: boolean) {
    const user = auth.currentUser;
    if (!user || !rawDeviceId) throw new Error("User/device belum siap");

    const idToken = await user.getIdToken();
    let lastMessage = "Status hardware belum terverifikasi";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 450));
      }

      const response = await fetch(`/api/tuya/device/${rawDeviceId}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();

      if (response.ok && data.success && data.online === true && data.state) {
        const actualOn = data.state.switch === true;
        if (actualOn === expectedOn) return data.state as DeviceState;
        lastMessage = expectedOn
          ? "Smart plug masih terdeteksi OFF"
          : "Smart plug masih terdeteksi ON";
      } else if (data.online === false) {
        lastMessage = "Device offline; kondisi relay tidak dapat diverifikasi";
      } else {
        lastMessage = String(data.error ?? lastMessage);
      }
    }

    throw new Error(lastMessage);
  }

  async function finishOperationalShutdownMode() {
    if (!rawDeviceId || shutdownMode?.status !== "SHUTDOWN_ACTIVE") {
      return;
    }

    beginTuyaActionWindow();

    try {
      setControlLoading(true);
      setError(null);

      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken = await user.getIdToken();

      /*
       * Setelah PS4 benar-benar sudah shutdown,
       * matikan kembali monitor.
       */

      const response = await fetch("/api/tuya/control", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          deviceId: rawDeviceId,
          action: "STOP",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal mematikan monitor");
      }

      // STOP command sukses belum berarti relay sudah benar-benar OFF.
      // Wajib online + OFF sebelum runtime dikembalikan ke READY.
      await verifyTuyaSwitch(false);

      /*
       * Audit shutdown ditutup hanya setelah
       * monitor berhasil dimatikan.
       */

      await completeShutdownMode(shutdownMode.id);

      setShutdownMode(null);

      setDeviceState((current) =>
        current
          ? {
              ...current,
              switch: false,
              countdown: 0,
            }
          : current,
      );

      setLiveCountdown(0);

      countdownRef.current = 0;

      showNotification(
        "success",
        "Shutdown selesai. Monitor telah dimatikan. Kabel power utama sekarang dapat dicabut.",
      );

      scheduleTuyaVerification(rawDeviceId);
    } catch (error) {
      console.error("FINISH SHUTDOWN MODE ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Gagal menyelesaikan Shutdown Mode",
      );
    } finally {
      setControlLoading(false);
    }
  }

  /* =======================================================
     CONTROL DEVICE
  ======================================================= */

  async function controlDevice(
    action: "ON" | "OFF" | "TIMER" | "ADD_TIME" | "STOP",
    durationMinutes?: number,
  ) {
    if (!rawDeviceId) {
      return;
    }

    if (isOffline) {
      if (preferences.showOfflineWarning) {
        showNotification(
          "warning",
          `${rawDeviceId.toUpperCase()} sedang offline. Cek listrik dan koneksi Wi-Fi BARDI Smart Plug.`,
        );
      }

      return;
    }

    beginTuyaActionWindow();

    try {
      setControlLoading(true);
      setError(null);

      const selectedPackage =
        durationMinutes !== undefined
          ? PACKAGES.find((pkg) => pkg.durationMinutes === durationMinutes)
          : undefined;

      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const idToken = await user.getIdToken();

      const sendTuyaCommand = async (
        requestedAction: "ON" | "OFF" | "TIMER" | "ADD_TIME" | "STOP",
        options?: { durationMinutes?: number; currentCountdown?: number },
      ) => {
        /*
         * Mulai/extend action window tepat sebelum command dikirim agar smart
         * polling tidak bertabrakan dengan command atau verification.
         */
        pauseTuyaPolling();

        const response = await fetch("/api/tuya/control", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            deviceId: rawDeviceId,
            action: requestedAction,
            ...(options?.durationMinutes !== undefined
              ? { durationMinutes: options.durationMinutes }
              : {}),
            ...(options?.currentCountdown !== undefined
              ? { currentCountdown: options.currentCountdown }
              : {}),
          }),
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const errorMessage = String(data.error || "Gagal mengontrol Tuya");

          if (
            errorMessage.toLowerCase().includes("offline") ||
            errorMessage.includes("40000801")
          ) {
            setDeviceOnline(false);
            setDeviceState(null);

            if (!sessionRef.current) {
              countdownRef.current = 0;
              setLiveCountdown(0);
            }

            setError(null);

            if (preferences.showOfflineWarning) {
              showNotification(
                "warning",
                `${rawDeviceId.toUpperCase()} sedang offline. Cek listrik dan koneksi Wi-Fi BARDI Smart Plug.`,
              );
            }
          }

          throw new Error(errorMessage);
        }

        return data;
      };

      const verifyTuyaInBackground = () => {
        scheduleTuyaVerification(rawDeviceId);
      };

      /* ===================================================
         STOP BILLING — FIREBASE FIRST

         Billing ditutup lebih dulu karena Firebase adalah source of truth.
         Setelah itu UI langsung selesai. STOP BARDI dikirim background agar
         operator tidak perlu menunggu round-trip Tuya untuk keluar dari state
         billing.
      =================================================== */

      if (action === "STOP" && sessionRef.current) {
        const activeSession = sessionRef.current;

        await completeSession(activeSession.id);

        setDeviceState((current) =>
          current
            ? {
                ...current,
                switch: false,
                countdown: 0,
              }
            : current,
        );
        setLiveCountdown(0);
        countdownRef.current = 0;

        showNotification(
          "success",
          "Session selesai. Monitor sedang dimatikan.",
        );

        void (async () => {
          try {
            await sendTuyaCommand("STOP");
            verifyTuyaInBackground();
          } catch (stopError) {
            console.error("BACKGROUND STOP TUYA ERROR:", stopError);

            showNotification(
              "warning",
              "Billing sudah selesai, tetapi BARDI belum dapat dikonfirmasi OFF. Cek monitor secara manual.",
            );
          }
        })();

        return;
      }

      /* ===================================================
         ADD TIME

         Tidak lagi reload active session dan tidak melakukan dua kali GET
         status Tuya. Response transaction Firebase langsung dipakai untuk
         memperbarui countdown/revenue di UI.
      =================================================== */

      if (action === "ADD_TIME" && selectedPackage) {
        const activeSession = sessionRef.current;

        if (!activeSession) {
          throw new Error("Tidak ada session aktif");
        }

        const currentCountdown = calculateSessionCountdown(activeSession);
        const added = await addPackageToFirebase(
          activeSession.id,
          selectedPackage,
        );

        const updatedSession: Session = {
          ...activeSession,
          totalMinutes: added.totalMinutes,
          totalPrice: added.totalPrice,
        };

        sessionRef.current = updatedSession;
        setSession(updatedSession);
        setSessionPackages((current) => [...current, added.package]);

        const updatedCountdown = calculateSessionCountdown(updatedSession);
        countdownRef.current = updatedCountdown;
        setLiveCountdown(updatedCountdown);

        try {
          await sendTuyaCommand("ADD_TIME", {
            durationMinutes: selectedPackage.durationMinutes,
            currentCountdown,
          });
        } catch (tuyaError) {
          console.error("ADD TIME TUYA SYNC ERROR:", tuyaError);

          showNotification(
            "warning",
            "Waktu billing sudah bertambah di Firebase, tetapi timer BARDI belum tersinkron. Coba refresh status device.",
          );
        }

        verifyTuyaInBackground();
        return;
      }

      /* ===================================================
         POWER ON → PREPARING (HARDWARE FIRST)

         Safety invariant v3.9:
         command ON -> verify online + ON -> baru PREPARING dibuat.
         Website kini sama dengan Android dan tidak pernah mencatat
         PREPARING ketika smart plug sebenarnya offline.
      =================================================== */

      if (action === "ON" && !sessionRef.current) {
        setDeviceOnline(true);
        setDeviceState((current) =>
          current
            ? { ...current, switch: true, countdown: 0 }
            : { switch: true, countdown: 0, power: 0, current: 0, voltage: 0 },
        );

        try {
          await sendTuyaCommand("ON");
          const verifiedState = await verifyTuyaSwitch(true);
          setDeviceOnline(true);
          setDeviceState(verifiedState);

          const activePreparing = await startPreparingSession(rawDeviceId);
          setPreparing(activePreparing);
          showNotification("success", "PREPARING aktif. Hardware sudah online dan terverifikasi ON.");
          return;
        } catch (prepareError) {
          setPreparing(null);
          setDeviceOnline(false);
          setDeviceState((current) =>
            current ? { ...current, switch: false, countdown: 0 } : current,
          );

          // Bila backend PREPARING gagal setelah hardware ON, rollback best effort.
          try {
            await sendTuyaCommand("STOP");
          } catch (rollbackError) {
            console.error("PREPARING HARDWARE ROLLBACK ERROR:", rollbackError);
          }

          throw prepareError;
        }
      }

      /* ===================================================
         TUYA CONTROL UTAMA
      =================================================== */

      await sendTuyaCommand(action, {
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      });

      /* Optimistic device state: jangan tunggu GET Tuya berikutnya. */
      if (action === "TIMER" && selectedPackage) {
        const seconds = selectedPackage.durationMinutes * 60;

        setDeviceOnline(true);
        setDeviceState((current) =>
          current
            ? { ...current, switch: true, countdown: seconds }
            : {
                switch: true,
                countdown: seconds,
                power: 0,
                current: 0,
                voltage: 0,
              },
        );
        countdownRef.current = seconds;
        setLiveCountdown(seconds);
      }

      if (action === "OFF" || action === "STOP") {
        setDeviceState((current) =>
          current
            ? { ...current, switch: false, countdown: 0 }
            : current,
        );
        countdownRef.current = 0;
        setLiveCountdown(0);
      }

      /* ===================================================
         TIMER / SESSION BARU

         Endpoint session sekarang sekaligus:
         - membuat billing
         - membuat INITIAL package
         - mengonversi PREPARING bila ada
         - mengembalikan object session lengkap

         Jadi tidak ada lagi restoreActiveSession + PATCH preparing terpisah.
      =================================================== */

      if (action === "TIMER" && selectedPackage) {
        if (sessionRef.current) {
          throw new Error("Masih ada session aktif");
        }

        try {
          const created = await createSession(selectedPackage);
          const createdSession = created.session;

          sessionRef.current = createdSession;
          expiryStopRef.current = false;
          setSession(createdSession);
          setSessionPackages(created.package ? [created.package] : []);

          const countdown = calculateSessionCountdown(createdSession);
          countdownRef.current = countdown;
          setLiveCountdown(countdown);

          if (created.preparingConverted || preparing) {
            setPreparing(null);
          }

          if (shutdownMode?.status === "SHUTDOWN_PENDING") {
            setShutdownMode(null);
          }

          showNotification("success", "Billing berhasil dimulai.");
        } catch (firebaseError) {
          /*
           * Tuya TIMER sudah aktif tetapi Firebase gagal. STOP tetap ditunggu
           * di jalur error agar tidak meninggalkan rental tanpa transaksi.
           */
          console.error("FIREBASE SESSION FAILED:", firebaseError);

          try {
            await sendTuyaCommand("STOP");
            setDeviceState((current) =>
              current
                ? { ...current, switch: false, countdown: 0 }
                : current,
            );
            countdownRef.current = 0;
            setLiveCountdown(0);
          } catch (rollbackError) {
            console.error("TUYA TIMER ROLLBACK ERROR:", rollbackError);
          }

          throw firebaseError;
        }
      }

      /* ===================================================
         MONITOR OFF TANPA BILLING
      =================================================== */

      if (
        (action === "OFF" || action === "STOP") &&
        !sessionRef.current &&
        preparing
      ) {
        try {
          await endPreparingWithoutBilling(preparing.id);
          setPreparing(null);
        } catch (preparingError) {
          console.error("END PREPARING WITHOUT BILLING ERROR:", preparingError);
        }
      }

      /*
       * Verifikasi Tuya tetap dilakukan, tetapi background. Operator tidak
       * perlu menunggu delay + GET status untuk menyelesaikan klik.
       */
      verifyTuyaInBackground();
    } catch (error) {
      console.error("CONTROL DEVICE ERROR:", error);

      const message =
        error instanceof Error ? error.message : "Gagal mengontrol device";
      const offline =
        message.toLowerCase().includes("offline") ||
        message.includes("40000801");

      if (!offline) {
        setError(message);
      }
    } finally {
      setControlLoading(false);
    }
  }

  /* =======================================================
     DERIVED STATE
  ======================================================= */

  const deviceId = rawDeviceId.toUpperCase();

  const isOffline = deviceOnline === false;

  const isOn = deviceOnline === true && deviceState?.switch === true;

  const sessionActive = session?.status === "ACTIVE";

  const totalBilling = session?.totalPrice ?? 0;

  const totalMinutes = session?.totalMinutes ?? 0;

  const deviceControlDisabled = controlLoading || loading || isOffline;

  const preparingRisk = getPreparingRisk(
    preparing?.startedAt ?? null,
    preparingNow,
  );

  const shutdownElapsedMinutes = getShutdownElapsedMinutes(
    shutdownMode?.status === "SHUTDOWN_ACTIVE"
      ? shutdownMode.startedAt
      : null,
    preparingNow,
  );

  /* =======================================================
     LOADING
  ======================================================= */

  if (!rawDeviceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading device...</div>
      </div>
    );
  }

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
        {notification && (
          <div className="fixed right-6 top-6 z-[9999] w-[360px]">
            <div
              className={`rounded-xl border p-4 shadow-lg ${
                notification.type === "error"
                  ? "border-red-200 bg-red-50"
                  : notification.type === "warning"
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    notification.type === "error"
                      ? "bg-red-100 text-red-600"
                      : notification.type === "warning"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {notification.type === "error"
                    ? "!"
                    : notification.type === "warning"
                      ? "!"
                      : "✓"}
                </div>

                <div>
                  <p
                    className={`text-sm font-semibold ${
                      notification.type === "error"
                        ? "text-red-800"
                        : notification.type === "warning"
                          ? "text-amber-800"
                          : "text-emerald-800"
                    }`}
                  >
                    {notification.type === "error"
                      ? "Terjadi Kesalahan"
                      : notification.type === "warning"
                        ? "Perhatian"
                        : "Berhasil"}
                  </p>

                  <p
                    className={`mt-1 text-sm ${
                      notification.type === "error"
                        ? "text-red-600"
                        : notification.type === "warning"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {notification.message}
                  </p>
                </div>

                <button
                  onClick={() => setNotification(null)}
                  className="ml-auto text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-6 p-6">
          {/* BACK */}

          <Link
            href="/realtime"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
          >
            <ArrowLeft size={17} />
            Back to Realtime
          </Link>

          {/* HEADER */}

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">
                  {deviceId}
                </h1>

                <span
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    isOffline
                      ? "bg-amber-50 text-amber-600"
                      : isOn
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isOffline
                        ? "bg-amber-500"
                        : isOn
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                    }`}
                  />

                  {loading
                    ? "LOADING"
                    : isOffline
                      ? "OFFLINE"
                      : isOn
                        ? "ON"
                        : "OFF"}
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Detailed monitoring and usage information
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Activity size={15} />

              {loading
                ? "Checking device..."
                : isOffline
                  ? "Device offline"
                  : error
                    ? "Connection Error"
                    : "Device connected"}
            </div>
          </div>

          {/* ERROR */}

          {error && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Device Offline
                </p>

                <p className="mt-1 text-sm text-amber-700">{error}</p>
              </div>

              <button
                onClick={() => setError(null)}
                className="text-xs font-medium text-amber-600 hover:text-amber-800"
              >
                Tutup
              </button>
            </div>
          )}

          {/* REALTIME CARDS */}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard
              icon={<Power size={20} />}
              title="Current Status"
              value={
                loading
                  ? "LOADING"
                  : isOffline
                    ? "OFFLINE"
                    : isOn
                      ? "ON"
                      : "OFF"
              }
              description="Current device state"
            />

            <InfoCard
              icon={<Clock3 size={20} />}
              title="Countdown"
              value={formatCountdown(liveCountdown)}
              description="Live Firebase session timer"
            />

            <InfoCard
              icon={<Zap size={20} />}
              title="Power"
              value={`${formatNumber(deviceState?.power ?? 0)} W`}
              description="Current power"
            />

            <InfoCard
              icon={<Gauge size={20} />}
              title="Voltage"
              value={`${formatVoltage(deviceState?.voltage ?? 0)} V`}
              description="Current voltage"
            />
          </div>

          {/* SHUTDOWN MODE */}

          {shutdownMode?.status === "SHUTDOWN_ACTIVE" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-violet-700">
                    SHUTDOWN MODE
                  </p>

                  <p className="mt-1 text-xs leading-5 text-violet-600">
                    {isOn
                      ? "Monitor dinyalakan hanya untuk mematikan PS4 secara normal. Mode ini tidak masuk billing dan tidak dianggap PREPARING."
                      : "Shutdown sudah tercatat di Firebase, tetapi monitor masih OFF. Nyalakan monitor untuk melanjutkan shutdown PS4."}
                  </p>

                  <p className="mt-2 text-xs font-semibold text-violet-700">
                    Durasi shutdown: {shutdownElapsedMinutes} menit
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    isOn
                      ? finishOperationalShutdownMode
                      : retryShutdownMonitorOn
                  }
                  disabled={controlLoading || isOffline}
                  className="shrink-0 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {controlLoading
                    ? isOn
                      ? "Mematikan Monitor..."
                      : "Menyalakan Monitor..."
                    : isOn
                      ? "SELESAI SHUTDOWN"
                      : "NYALAKAN MONITOR"}
                </button>
              </div>
            </div>
          )}

          {/* PREPARING AUDIT */}

          {preparing && !sessionActive && (
            <div
              className={`rounded-xl border p-5 shadow-sm ${
                preparingRisk.level === "SUSPICIOUS"
                  ? "border-red-200 bg-red-50"
                  : preparingRisk.level === "WARNING"
                    ? "border-amber-200 bg-amber-50"
                    : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p
                    className={`text-sm font-bold ${
                      preparingRisk.level === "SUSPICIOUS"
                        ? "text-red-700"
                        : preparingRisk.level === "WARNING"
                          ? "text-amber-700"
                          : "text-blue-700"
                    }`}
                  >
                    {preparingRisk.level === "SUSPICIOUS"
                      ? "SUSPICIOUS PREPARING"
                      : preparingRisk.level === "WARNING"
                        ? "PREPARING WARNING"
                        : "PREPARING"}
                  </p>

                  <p
                    className={`mt-1 text-xs ${
                      preparingRisk.level === "SUSPICIOUS"
                        ? "text-red-600"
                        : preparingRisk.level === "WARNING"
                          ? "text-amber-600"
                          : "text-blue-600"
                    }`}
                  >
                    Monitor sudah ON selama {preparingRisk.elapsedMinutes} menit
                    tanpa billing.
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs font-medium text-slate-500">
                    Batas warning
                  </p>

                  <p className="mt-1 text-sm font-bold text-slate-800">
                    45 menit
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* RENTAL CONTROL */}

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Rental Control
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Control BARDI Smart Plug untuk sesi rental
            </p>

            <div className="mt-6 space-y-6">
              {/* RESTORING */}

              {restoringSession && (
                <div className="rounded-xl bg-blue-50 p-5 text-sm text-blue-700">
                  Mengecek session aktif...
                </div>
              )}

              {/* OFFLINE */}

              {!restoringSession &&
                isOffline &&
                preferences.showOfflineWarning && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <p className="text-sm font-semibold text-amber-800">
                      DEVICE OFFLINE
                    </p>

                    <p className="mt-1 text-xs text-amber-700">
                      {deviceId} tidak dapat dihubungi. Periksa listrik dan
                      koneksi Wi-Fi BARDI Smart Plug.
                    </p>
                  </div>
                )}

              {/* OFF */}

              {!restoringSession &&
                !isOffline &&
                !isOn &&
                !sessionActive &&
                !shutdownMode && (
                  <div>
                    <div className="mb-4 rounded-xl bg-slate-50 p-5">
                      <p className="text-sm font-semibold text-slate-700">
                        PS OFF
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Nyalakan monitor untuk persiapan rental. Setelah siap,
                        pilih paket untuk memulai billing.
                      </p>
                    </div>

                    <button
                      onClick={() => controlDevice("ON")}
                      disabled={deviceControlDisabled}
                      className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isOffline
                        ? "DEVICE OFFLINE"
                        : controlLoading
                          ? "Turning On..."
                          : "SIAPKAN RENTAL"}
                    </button>
                  </div>
                )}

              {/* SHUTDOWN PENDING — PERSISTENT */}

              {!restoringSession &&
                !sessionActive &&
                !preparing &&
                shutdownMode?.status === "SHUTDOWN_PENDING" && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
                    <p className="text-sm font-semibold text-violet-700">
                      Rental selesai — PS4 belum dikonfirmasi shutdown
                    </p>

                    <p className="mt-1 text-xs leading-5 text-violet-600">
                      Status ini disimpan di Firebase. Refresh, logout/login,
                      atau pindah halaman tidak akan menghilangkan opsi shutdown.
                      Shutdown Mode tidak membuat billing dan tidak dihitung
                      sebagai PREPARING.
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={startOperationalShutdownMode}
                        disabled={controlLoading || isOffline}
                        className="w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isOffline
                          ? "DEVICE OFFLINE"
                          : controlLoading
                            ? "Menyalakan Monitor..."
                            : "SHUTDOWN MODE"}
                      </button>

                      <button
                        type="button"
                        onClick={() => controlDevice("ON")}
                        disabled={deviceControlDisabled}
                        className="w-full rounded-xl border border-blue-200 bg-white px-5 py-4 text-sm font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {controlLoading
                          ? "Menyiapkan..."
                          : "SIAPKAN RENTAL BERIKUTNYA"}
                      </button>
                    </div>
                  </div>
                )}

              {/* ON NO SESSION */}

              {!restoringSession &&
                isOn &&
                !sessionActive &&
                shutdownMode?.status !== "SHUTDOWN_ACTIVE" && (
                <div>
                  <div className="mb-4 rounded-xl bg-blue-50 p-5">
                    <p className="text-sm font-semibold text-blue-700">
                      PS SIAP DIGUNAKAN
                    </p>

                    <p className="mt-1 text-xs text-blue-600">
                      Pilih paket untuk memulai sesi rental.
                    </p>
                  </div>

                  <p className="mb-3 text-sm font-semibold text-slate-700">
                    Pilih Paket
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {PACKAGES.map((pkg) => (
                      <button
                        key={pkg.id}
                        onClick={() =>
                          controlDevice("TIMER", pkg.durationMinutes)
                        }
                        disabled={deviceControlDisabled}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <p className="text-sm font-bold text-slate-900">
                          {pkg.name}
                        </p>

                        <p className="mt-1 text-sm font-semibold text-blue-600">
                          Rp
                          {pkg.price.toLocaleString("id-ID")}
                        </p>

                        {pkg.saving > 0 && (
                          <p className="mt-1 text-xs text-emerald-600">
                            Hemat Rp
                            {pkg.saving.toLocaleString("id-ID")}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ACTIVE SESSION */}

              {sessionActive && (
                <>
                  {/* RUNNING */}

                  <div className="rounded-xl bg-emerald-50 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">
                          {isOffline ? "PS OFFLINE" : "PS RUNNING"}
                        </p>

                        <p className="mt-2 text-3xl font-bold text-emerald-700">
                          {formatCountdown(liveCountdown)}
                        </p>

                        <p className="mt-1 text-sm text-emerald-600">
                          Remaining time
                        </p>
                      </div>

                      <Power size={25} className="text-emerald-600" />
                    </div>
                  </div>

                  {/* BILLING */}

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                    <div className="flex items-center gap-2">
                      <Receipt size={18} className="text-blue-600" />

                      <p className="text-sm font-semibold text-blue-700">
                        Total Billing
                      </p>
                    </div>

                    <p className="mt-2 text-3xl font-bold text-blue-800">
                      Rp
                      {totalBilling.toLocaleString("id-ID")}
                    </p>

                    <p className="mt-1 text-xs text-blue-600">
                      Total waktu: {formatMinutes(totalMinutes)}
                    </p>
                  </div>

                  {/* PACKAGE HISTORY */}

                  <div className="rounded-xl border border-slate-200">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <p className="text-sm font-semibold text-slate-700">
                        Paket Sesi
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {sessionPackages.map((pkg, index) => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between px-5 py-4"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {index === 0 ? "Paket Awal" : "Tambah Waktu"} —{" "}
                              {pkg.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {pkg.addedAt
                                ? new Date(pkg.addedAt).toLocaleTimeString(
                                    "id-ID",
                                  )
                                : "-"}
                            </p>
                          </div>

                          <p className="text-sm font-semibold text-slate-700">
                            Rp
                            {pkg.price.toLocaleString("id-ID")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ADD TIME */}

                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <Plus size={17} className="text-blue-600" />

                      <p className="text-sm font-semibold text-slate-700">
                        Tambah Waktu
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {PACKAGES.map((pkg) => (
                        <button
                          key={pkg.id}
                          onClick={() =>
                            controlDevice("ADD_TIME", pkg.durationMinutes)
                          }
                          disabled={deviceControlDisabled}
                          className="rounded-xl border border-blue-200 bg-white p-4 text-left hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <p className="text-sm font-bold text-slate-900">
                            + {pkg.name}
                          </p>

                          <p className="mt-1 text-sm font-semibold text-blue-600">
                            Rp
                            {pkg.price.toLocaleString("id-ID")}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* STOP */}

                  <button
                    onClick={() => controlDevice("STOP")}
                    disabled={deviceControlDisabled || completingSession}
                    className="w-full rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    {isOffline
                      ? "DEVICE OFFLINE"
                      : controlLoading || completingSession
                        ? "Stopping..."
                        : "STOP SESSION"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* DEVICE REALTIME */}

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Device Realtime
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Live data from BARDI Smart Plug through Tuya Cloud
              </p>
            </div>

            <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <RealtimeValue
                label="Switch"
                value={isOffline ? "OFFLINE" : isOn ? "ON" : "OFF"}
              />

              <RealtimeValue
                label="Countdown"
                value={formatCountdown(liveCountdown)}
              />

              <RealtimeValue
                label="Current"
                value={`${formatNumber(deviceState?.current ?? 0)} mA`}
              />

              <RealtimeValue
                label="Power"
                value={`${formatNumber(deviceState?.power ?? 0)} W`}
              />
            </div>
          </div>

          {/* FIREBASE SESSION */}

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Firebase Session
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Session tersimpan secara persistent di Firebase
              </p>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <RealtimeValue label="Session ID" value={session?.id ?? "-"} />

              <RealtimeValue
                label="Status"
                value={session?.status ?? "NO SESSION"}
              />

              <RealtimeValue
                label="Total Waktu"
                value={formatMinutes(totalMinutes)}
              />

              <RealtimeValue
                label="Total Billing"
                value={`Rp${totalBilling.toLocaleString("id-ID")}`}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   INFO CARD
========================================================= */

function InfoCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>

          <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>

          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   REALTIME VALUE
========================================================= */

function RealtimeValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-all text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

/* =========================================================
   CALCULATE SESSION COUNTDOWN
========================================================= */

function calculateSessionCountdown(session: Session | null) {
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
   FORMAT MINUTES
========================================================= */

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);

  const remaining = minutes % 60;

  if (hours > 0) {
    if (remaining > 0) {
      return `${hours} Jam ${remaining} Menit`;
    }

    return `${hours} Jam`;
  }

  return `${remaining} Menit`;
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
