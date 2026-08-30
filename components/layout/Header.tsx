"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import {
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Menu,
  X,
} from "lucide-react";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type HeaderProps = {
  onMenuClick: () => void;
};

type SessionRow = {
  id: string;
  deviceId: string;
  status: "ACTIVE" | "COMPLETED";
  startedAt: unknown;
  endedAt: unknown;
  totalMinutes: number;
  totalPrice: number;
};

type NotificationItem = {
  id: string;
  sessionId: string;
  deviceId: string;
  type: "STARTED" | "ENDING_SOON" | "COMPLETED";
  title: string;
  description: string;
  timestampMs: number;
  href: string;
};

const READ_NOTIFICATIONS_KEY = "noir-playbox-read-notifications";

export default function Header({ onMenuClick }: HeaderProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const [notificationOpen, setNotificationOpen] = useState(false);

  const [readIds, setReadIds] = useState<string[]>([]);

  const [now, setNow] = useState(0);

  const notificationRef = useRef<HTMLDivElement>(null);

  /* =========================================================
     FIREBASE SESSION LISTENER
  ========================================================= */

  useEffect(() => {
    const sessionsQuery = query(
      collection(db, "sessions"),
      orderBy("startedAt", "desc"),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      sessionsQuery,

      (snapshot) => {
        const rows = snapshot.docs.map((sessionDoc) => ({
          id: sessionDoc.id,
          ...(sessionDoc.data() as Omit<SessionRow, "id">),
        }));

        setSessions(rows);
      },

      (error) => {
        console.error("HEADER NOTIFICATION FIRESTORE ERROR:", error);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  /* =========================================================
     CLOCK

     Dibutuhkan supaya notifikasi "hampir habis"
     bisa berubah tanpa menunggu perubahan Firestore.
  ========================================================= */

  useEffect(() => {
    const updateNow = () => {
      setNow(Date.now());
    };

    const timeout = setTimeout(updateNow, 0);
    const interval = setInterval(updateNow, 30_000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  /* =========================================================
     LOAD READ STATE
  ========================================================= */

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        const stored = localStorage.getItem(READ_NOTIFICATIONS_KEY);

        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          setReadIds(parsed);
        }
      } catch (error) {
        console.error("READ NOTIFICATION STATE ERROR:", error);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  /* =========================================================
     CLOSE ON OUTSIDE CLICK
  ========================================================= */

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  /* =========================================================
     BUILD NOTIFICATIONS
  ========================================================= */

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];

    for (const session of sessions) {
      const startedAtMs = timestampToMs(session.startedAt);

      const endedAtMs = timestampToMs(session.endedAt);

      /* STARTED */

      if (startedAtMs) {
        items.push({
          id: `${session.id}-started`,
          sessionId: session.id,
          deviceId: session.deviceId || "PlayBox",
          type: "STARTED",
          title: `${session.deviceId || "PlayBox"} mulai rental`,
          description: `${formatMinutes(session.totalMinutes)} • Rp${Number(
            session.totalPrice ?? 0,
          ).toLocaleString("id-ID")}`,
          timestampMs: startedAtMs,
          href: `/realtime/${String(session.deviceId).toUpperCase()}`,
        });
      }

      /* ENDING SOON */

      if (session.status === "ACTIVE" && startedAtMs) {
        const endAtMs =
          startedAtMs + Math.max(0, Number(session.totalMinutes ?? 0)) * 60_000;

        const remainingMs = endAtMs - now;

        if (remainingMs > 0 && remainingMs <= 10 * 60_000) {
          items.push({
            id: `${session.id}-ending-soon`,
            sessionId: session.id,
            deviceId: session.deviceId || "PlayBox",
            type: "ENDING_SOON",
            title: `${session.deviceId || "PlayBox"} hampir habis`,
            description: `Sisa ${formatCountdownFromMs(remainingMs)}`,
            timestampMs: now,
            href: `/realtime/${String(session.deviceId).toUpperCase()}`,
          });
        }
      }

      /* COMPLETED */

      if (session.status === "COMPLETED" && endedAtMs) {
        items.push({
          id: `${session.id}-completed`,
          sessionId: session.id,
          deviceId: session.deviceId || "PlayBox",
          type: "COMPLETED",
          title: `${session.deviceId || "PlayBox"} selesai`,
          description: `${formatMinutes(session.totalMinutes)} • Rp${Number(
            session.totalPrice ?? 0,
          ).toLocaleString("id-ID")}`,
          timestampMs: endedAtMs,
          href: `/realtime/${String(session.deviceId).toUpperCase()}`,
        });
      }
    }

    return items.sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 12);
  }, [sessions, now]);

  const unreadCount = useMemo(
    () =>
      notifications.filter((notification) => !readIds.includes(notification.id))
        .length,
    [notifications, readIds],
  );

  /* =========================================================
     READ HANDLERS
  ========================================================= */

  function persistReadIds(ids: string[]) {
    const unique = Array.from(new Set(ids)).slice(-100);

    setReadIds(unique);

    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(unique));
  }

  function markAsRead(id: string) {
    if (readIds.includes(id)) {
      return;
    }

    persistReadIds([...readIds, id]);
  }

  function markAllRead() {
    persistReadIds([
      ...readIds,
      ...notifications.map((notification) => notification.id),
    ]);
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      {/* LEFT */}

      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="relative z-40 shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 lg:hidden"
        >
          <Menu size={21} />
        </button>

        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
            Dashboard Overview
          </h2>

          <p className="hidden text-xs text-slate-500 sm:block">
            Monitor your PlayBox operations
          </p>
        </div>
      </div>

      {/* RIGHT */}

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* NOTIFICATION */}

        <div ref={notificationRef} className="relative">
          <button
            type="button"
            onClick={() => setNotificationOpen((current) => !current)}
            aria-label="Notifications"
            className={`relative rounded-lg p-2 transition ${
              notificationOpen
                ? "bg-blue-50 text-blue-600"
                : "text-slate-500 hover:bg-slate-100 hover:text-blue-600"
            }`}
          >
            <Bell size={20} />

            {unreadCount > 0 && (
              <>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />

                <span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white shadow-sm">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </>
            )}
          </button>

          {/* DROPDOWN */}

          {notificationOpen && (
            <div className="fixed left-4 right-4 top-[76px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[390px]">
              {/* HEADER */}

              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Notifications
                    </h3>

                    {unreadCount > 0 && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Aktivitas rental PlayBox realtime
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setNotificationOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 sm:hidden"
                >
                  <X size={17} />
                </button>
              </div>

              {/* MARK READ */}

              {notifications.length > 0 && (
                <div className="flex justify-end border-b border-slate-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 transition hover:text-blue-700 disabled:cursor-default disabled:text-slate-300"
                  >
                    <Check size={13} />
                    Mark all read
                  </button>
                </div>
              )}

              {/* LIST */}

              <div className="max-h-[420px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                      <Bell size={21} />
                    </div>

                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      Belum ada notifikasi
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Aktivitas session Firebase akan muncul di sini.
                    </p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const unread = !readIds.includes(notification.id);

                    return (
                      <Link
                        key={notification.id}
                        href={notification.href}
                        onClick={() => {
                          markAsRead(notification.id);

                          setNotificationOpen(false);
                        }}
                        className={`flex gap-3 border-b border-slate-100 px-4 py-4 transition last:border-b-0 hover:bg-slate-50 ${
                          unread ? "bg-blue-50/40" : "bg-white"
                        }`}
                      >
                        <NotificationIcon type={notification.type} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p
                              className={`text-sm ${
                                unread
                                  ? "font-bold text-slate-900"
                                  : "font-semibold text-slate-700"
                              }`}
                            >
                              {notification.title}
                            </p>

                            {unread && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                            )}
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            {notification.description}
                          </p>

                          <p className="mt-2 text-[10px] font-medium text-slate-400">
                            {formatRelativeTime(notification.timestampMs)}
                          </p>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* PROFILE */}

        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
            AH
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800">Admin</p>

            <p className="text-xs text-slate-500">Noir Playbox</p>
          </div>
        </div>
      </div>
    </header>
  );
}

/* =========================================================
   NOTIFICATION ICON
========================================================= */

function NotificationIcon({ type }: { type: NotificationItem["type"] }) {
  if (type === "ENDING_SOON") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        <Clock3 size={17} />
      </div>
    );
  }

  if (type === "COMPLETED") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <CheckCircle2 size={17} />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
      <Gamepad2 size={17} />
    </div>
  );
}

/* =========================================================
   TIMESTAMP
========================================================= */

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

  if (typeof value === "object" && value !== null) {
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

/* =========================================================
   FORMAT
========================================================= */

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));

  const hours = Math.floor(safeMinutes / 60);

  const remaining = safeMinutes % 60;

  if (hours <= 0) {
    return `${remaining} menit`;
  }

  if (remaining <= 0) {
    return `${hours} jam`;
  }

  return `${hours}j ${remaining}m`;
}

function formatCountdownFromMs(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));

  const minutes = Math.floor(totalSeconds / 60);

  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatRelativeTime(timestampMs: number) {
  const diff = Math.max(0, Date.now() - timestampMs);

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
