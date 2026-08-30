"use client";

import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Gamepad2,
  Percent,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { auth } from "@/lib/firebase";
import AddCafeDialog from "@/components/admin/AddCafeDialog";

type Cafe = {
  id: string;
  name: string;
  revenueShareNoir: number;
  revenueShareCafe: number;
  active: boolean;
};

type CafeResponse = {
  success: boolean;
  error?: string;
  cafes: Cafe[];
};

export default function CafesPage() {
  const [collapsed, setCollapsed] =
    useState(false);

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const [cafes, setCafes] =
    useState<Cafe[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const load =
    useCallback(async () => {
      try {
        const user =
          auth.currentUser;

        if (!user) {
          throw new Error(
            "User belum login",
          );
        }

        const token =
          await user.getIdToken();

        const response =
          await fetch(
            "/api/admin/cafes",
            {
              cache:
                "no-store",
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          );

        const data =
          (await response.json()) as CafeResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Gagal mengambil cafe",
          );
        }

        setCafes(
          data.cafes ?? [],
        );

        setError(null);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Gagal mengambil cafe",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    const timeout =
      setTimeout(() => {
        void load();
      }, 0);

    return () =>
      clearTimeout(timeout);
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() =>
          setCollapsed(
            (prev) => !prev,
          )
        }
        mobileOpen={
          mobileSidebarOpen
        }
        onMobileClose={() =>
          setMobileSidebarOpen(
            false,
          )
        }
      />

      <main
        className={`min-h-screen transition-all duration-300 ${
          collapsed
            ? "lg:ml-20"
            : "lg:ml-64"
        }`}
      >
        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(
              (prev) => !prev,
            )
          }
        />

        <div className="space-y-6 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Cafes
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Pilih cafe untuk melihat unit, session, dan revenue secara khusus.
              </p>
            </div>

            <AddCafeDialog
              onCreated={() => void load()}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Loading cafes...
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cafes.map(
                (cafe) => (
                  <Link
                    key={cafe.id}
                    href={`/cafes/${cafe.id}`}
                    className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-900 transition group-hover:text-blue-600">
                          {cafe.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {cafe.id}
                        </p>
                      </div>

                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Building2
                          size={19}
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <Info
                        icon={
                          <Percent
                            size={16}
                          />
                        }
                        label="Noir"
                        value={`${cafe.revenueShareNoir}%`}
                      />

                      <Info
                        icon={
                          <Percent
                            size={16}
                          />
                        }
                        label="Cafe"
                        value={`${cafe.revenueShareCafe}%`}
                      />
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Gamepad2
                          size={15}
                        />
                        Lihat detail cafe
                      </div>

                      <ChevronRight
                        size={17}
                        className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600"
                      />
                    </div>
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Info({
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
      <div className="flex items-center gap-2 text-slate-400">
        {icon}

        <span className="text-[10px] font-bold uppercase">
          {label}
        </span>
      </div>

      <p className="mt-2 font-bold text-slate-800">
        {value}
      </p>
    </div>
  );
}
