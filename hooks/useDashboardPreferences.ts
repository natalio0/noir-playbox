"use client";

import { useEffect, useState } from "react";

export type DashboardPreferences = {
  autoRefresh: boolean;
  refreshInterval: number;
  showOfflineWarning: boolean;
  compactCards: boolean;
};

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  autoRefresh: true,
  refreshInterval: 15,
  showOfflineWarning: true,
  compactCards: false,
};

export const DASHBOARD_SETTINGS_KEY = "noir-playbox-dashboard-settings";

function readPreferences(): DashboardPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }

  try {
    const stored = window.localStorage.getItem(DASHBOARD_SETTINGS_KEY);

    if (!stored) {
      return DEFAULT_DASHBOARD_PREFERENCES;
    }

    const parsed = JSON.parse(stored);

    const refreshInterval = [10, 15, 30].includes(Number(parsed?.refreshInterval))
      ? Number(parsed.refreshInterval)
      : DEFAULT_DASHBOARD_PREFERENCES.refreshInterval;

    return {
      autoRefresh:
        typeof parsed?.autoRefresh === "boolean"
          ? parsed.autoRefresh
          : DEFAULT_DASHBOARD_PREFERENCES.autoRefresh,

      refreshInterval,

      showOfflineWarning:
        typeof parsed?.showOfflineWarning === "boolean"
          ? parsed.showOfflineWarning
          : DEFAULT_DASHBOARD_PREFERENCES.showOfflineWarning,

      compactCards:
        typeof parsed?.compactCards === "boolean"
          ? parsed.compactCards
          : DEFAULT_DASHBOARD_PREFERENCES.compactCards,
    };
  } catch (error) {
    console.error("READ DASHBOARD SETTINGS ERROR:", error);

    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

export function useDashboardPreferences() {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES,
  );

  useEffect(() => {
    function syncPreferences() {
      setPreferences(readPreferences());
    }

    syncPreferences();

    window.addEventListener("storage", syncPreferences);
    window.addEventListener("noir-dashboard-settings-changed", syncPreferences);

    return () => {
      window.removeEventListener("storage", syncPreferences);

      window.removeEventListener(
        "noir-dashboard-settings-changed",
        syncPreferences,
      );
    };
  }, []);

  return preferences;
}

export function notifyDashboardPreferencesChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("noir-dashboard-settings-changed"));
}
