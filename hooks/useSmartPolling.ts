"use client";

import { useEffect, useRef } from "react";

type SmartPollingOptions = {
  enabled: boolean;
  intervalMs: number;
  runImmediately?: boolean;
};

export function useSmartPolling(
  callback: () => void | Promise<void>,
  { enabled, intervalMs, runImmediately = false }: SmartPollingOptions,
) {
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);
  const lastRunRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const run = async () => {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        runningRef.current
      ) {
        return;
      }

      runningRef.current = true;

      try {
        await callbackRef.current();
        lastRunRef.current = Date.now();
      } finally {
        runningRef.current = false;
      }
    };

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => void run(), intervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (Date.now() - lastRunRef.current >= intervalMs) {
        void run();
      }
    };

    if (runImmediately) {
      void run();
    }

    start();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      cancelled = true;

      if (timer) {
        clearInterval(timer);
      }

      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [enabled, intervalMs, runImmediately]);
}
