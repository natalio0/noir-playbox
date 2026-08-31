"use client";

import { useEffect, useState } from "react";

import {
  Building2,
  Check,
  Gauge,
  Mail,
  Monitor,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
  Wifi,
} from "lucide-react";

import { doc, updateDoc } from "firebase/firestore";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/components/providers/AuthProvider";

/* =========================================================
   TYPES
========================================================= */

type DashboardPreferences = {
  autoRefresh: boolean;
  refreshInterval: number;
  showOfflineWarning: boolean;
  compactCards: boolean;
  tuyaApiSaver: boolean;
};

/* =========================================================
   DEFAULT SETTINGS
========================================================= */

const DEFAULT_PREFERENCES: DashboardPreferences = {
  autoRefresh: true,
  refreshInterval: 15,
  showOfflineWarning: true,
  compactCards: false,
  tuyaApiSaver: true,
};

/* =========================================================
   PAGE
========================================================= */

export default function SettingsPage() {
  const { profile } = useAuth();

  /* =======================================================
     SIDEBAR
  ======================================================= */

  const [collapsed, setCollapsed] = useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /* =======================================================
     PROFILE
  ======================================================= */

  const [name, setName] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);

  /* =======================================================
     PREFERENCES
  ======================================================= */

  const [preferences, setPreferences] =
    useState<DashboardPreferences>(DEFAULT_PREFERENCES);

  const [savingPreferences, setSavingPreferences] = useState(false);

  /* =======================================================
     NOTIFICATION
  ======================================================= */

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /* =======================================================
     LOAD PROFILE
  ======================================================= */

  useEffect(() => {
    if (!profile) {
      return;
    }

    const timeout = setTimeout(() => {
      setName(profile.name ?? "");
    }, 0);

    return () => clearTimeout(timeout);
  }, [profile]);

  /* =======================================================
     LOAD LOCAL PREFERENCES
  ======================================================= */

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        const stored = localStorage.getItem(
          "noir-playbox-dashboard-settings",
        );

        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored);

        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed,
        });
      } catch (error) {
        console.error("LOAD DASHBOARD SETTINGS ERROR:", error);
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  /* =======================================================
     SHOW NOTIFICATION
  ======================================================= */

  function showNotification(type: "success" | "error", message: string) {
    setNotification({
      type,
      message,
    });

    setTimeout(() => {
      setNotification(null);
    }, 3500);
  }

  /* =======================================================
     SAVE PROFILE
  ======================================================= */

  async function saveProfile() {
    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("User belum login");
      }

      const trimmedName = name.trim();

      if (!trimmedName) {
        throw new Error("Nama tidak boleh kosong");
      }

      setSavingProfile(true);

      const userRef = doc(db, "users", user.uid);

      await updateDoc(userRef, {
        name: trimmedName,
        updatedAt: new Date(),
      });

      showNotification("success", "Profile berhasil diperbarui.");
    } catch (error) {
      console.error("SAVE PROFILE ERROR:", error);

      showNotification(
        "error",
        error instanceof Error ? error.message : "Gagal memperbarui profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  /* =======================================================
     SAVE PREFERENCES
  ======================================================= */

  function savePreferences() {
    try {
      setSavingPreferences(true);

      localStorage.setItem(
        "noir-playbox-dashboard-settings",
        JSON.stringify(preferences),
      );

      showNotification("success", "Dashboard preferences berhasil disimpan.");
    } catch (error) {
      console.error("SAVE SETTINGS ERROR:", error);

      showNotification("error", "Gagal menyimpan dashboard preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* =================================================
          SIDEBAR
      ================================================== */}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* =================================================
          MAIN
      ================================================== */}

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

        {/* =================================================
            NOTIFICATION
        ================================================== */}

        {notification && (
          <div className="fixed right-4 top-24 z-[9999] w-[calc(100%-2rem)] max-w-sm sm:right-6">
            <div
              className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg ${
                notification.type === "success"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  notification.type === "success"
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {notification.type === "success" ? <Check size={16} /> : "!"}
              </div>

              <p
                className={`text-sm ${
                  notification.type === "success"
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {notification.message}
              </p>
            </div>
          </div>
        )}

        {/* =================================================
            CONTENT
        ================================================== */}

        <div className="space-y-6 p-4 sm:p-6">
          {/* =================================================
              HEADING
          ================================================== */}

          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

            <p className="mt-1 text-sm text-slate-500">
              Kelola akun dan preferensi dashboard Noir Playbox.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            {/* =================================================
                LEFT
            ================================================== */}

            <div className="space-y-6 xl:col-span-2">
              {/* ===============================================
                  ACCOUNT
              ================================================ */}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <User size={19} />
                    </div>

                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Account
                      </h2>

                      <p className="mt-0.5 text-xs text-slate-500">
                        Informasi akun dashboard
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  {/* NAME */}

                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Nama
                    </label>

                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Nama pengguna"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    />
                  </div>

                  {/* EMAIL */}

                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Email
                    </label>

                    <div className="relative mt-2">
                      <Mail
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        value={profile?.email ?? auth.currentUser?.email ?? ""}
                        disabled
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-500"
                      />
                    </div>

                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Email tidak dapat diubah dari dashboard.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProfile ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}

                    {savingProfile ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </section>

              {/* ===============================================
                  DASHBOARD PREFERENCES
              ================================================ */}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Monitor size={19} />
                    </div>

                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Dashboard Preferences
                      </h2>

                      <p className="mt-0.5 text-xs text-slate-500">
                        Pengaturan tampilan dan monitoring
                      </p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {/* AUTO REFRESH */}

                  <SettingToggle
                    icon={<RefreshCw size={17} />}
                    title="Auto Refresh"
                    description="Refresh data Tuya dan Firebase secara otomatis."
                    checked={preferences.autoRefresh}
                    onChange={(checked) =>
                      setPreferences((current) => ({
                        ...current,
                        autoRefresh: checked,
                      }))
                    }
                  />

                  {/* TUYA API SAVER */}

                  <SettingToggle
                    icon={<Gauge size={17} />}
                    title="Tuya API Saver"
                    description="Hemat kuota Tuya Cloud: overview 15 menit, detail 10 menit. Action ON/OFF/TIMER tetap realtime."
                    checked={preferences.tuyaApiSaver}
                    onChange={(checked) =>
                      setPreferences((current) => ({
                        ...current,
                        tuyaApiSaver: checked,
                      }))
                    }
                  />

                  {/* OFFLINE WARNING */}

                  <SettingToggle
                    icon={<Wifi size={17} />}
                    title="Offline Warning"
                    description="Tampilkan peringatan ketika BARDI Smart Plug offline."
                    checked={preferences.showOfflineWarning}
                    onChange={(checked) =>
                      setPreferences((current) => ({
                        ...current,
                        showOfflineWarning: checked,
                      }))
                    }
                  />

                  {/* COMPACT */}

                  <SettingToggle
                    icon={<Monitor size={17} />}
                    title="Compact Device Cards"
                    description="Gunakan tampilan card PlayBox yang lebih ringkas."
                    checked={preferences.compactCards}
                    onChange={(checked) =>
                      setPreferences((current) => ({
                        ...current,
                        compactCards: checked,
                      }))
                    }
                  />
                </div>

                {/* REFRESH INTERVAL */}

                <div className="border-t border-slate-100 p-5 sm:p-6">
                  <label className="text-xs font-semibold text-slate-600">
                    Refresh Interval
                  </label>

                  <p className="mt-1 text-xs text-slate-400">
                    Interval polling normal. Saat Tuya API Saver aktif, overview/detail memakai interval hemat otomatis.
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[10, 15, 30].map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() =>
                          setPreferences((current) => ({
                            ...current,
                            refreshInterval: seconds,
                          }))
                        }
                        className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                          preferences.refreshInterval === seconds
                            ? "border-blue-200 bg-blue-50 text-blue-600"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={savePreferences}
                    disabled={savingPreferences}
                    className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save size={16} />
                    Save Preferences
                  </button>
                </div>
              </section>
            </div>

            {/* =================================================
                RIGHT
            ================================================== */}

            <div className="space-y-6">
              {/* ===============================================
                  ACCESS
              ================================================ */}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-blue-600" />

                    <h2 className="text-sm font-semibold text-slate-900">
                      Access
                    </h2>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <InfoRow label="Role" value={profile?.role ?? "-"} />

                  <InfoRow
                    label="User ID"
                    value={
                      auth.currentUser?.uid
                        ? `${auth.currentUser.uid.slice(0, 8)}...`
                        : "-"
                    }
                  />
                </div>
              </section>

              {/* ===============================================
                  CAFE
              ================================================ */}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-blue-600" />

                    <h2 className="text-sm font-semibold text-slate-900">
                      Cafe Access
                    </h2>
                  </div>
                </div>

                <div className="p-5">
                  {profile?.role === "admin" ? (
                    <div className="rounded-xl bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-blue-700">
                        Full Access
                      </p>

                      <p className="mt-1 text-xs leading-5 text-blue-600">
                        Admin memiliki akses ke seluruh cafe dan PlayBox.
                      </p>
                    </div>
                  ) : profile?.cafeId ? (
                    <div>
                      <p className="text-xs text-slate-400">Assigned Cafe</p>

                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {profile.cafeId}
                      </p>

                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Akun operational hanya dapat mengakses PlayBox pada cafe
                        ini.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-700">
                        Cafe belum ditentukan
                      </p>

                      <p className="mt-1 text-xs text-amber-600">
                        Hubungi admin untuk menentukan akses cafe.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* ===============================================
                  SYSTEM
              ================================================ */}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    System
                  </h2>
                </div>

                <div className="space-y-4 p-5">
                  <SystemStatus label="Firebase" status="Connected" />

                  <SystemStatus label="Tuya Cloud" status="Active" />

                  <SystemStatus label="Realtime Monitoring" status="Running" />
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   SETTING TOGGLE
========================================================= */

function SettingToggle({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
          {icon}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>

          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

/* =========================================================
   INFO ROW
========================================================= */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-all text-sm font-semibold capitalize text-slate-700">
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   SYSTEM STATUS
========================================================= */

function SystemStatus({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>

      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />

        <span className="text-xs font-semibold text-emerald-600">{status}</span>
      </div>
    </div>
  );
}
