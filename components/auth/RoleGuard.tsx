"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/providers/AuthProvider";

const OPERATIONAL_ALLOWED_ROUTES = ["/", "/realtime", "/settings"];

function isOperationalAllowed(pathname: string) {
  return OPERATIONAL_ALLOWED_ROUTES.some((route) => {
    /*
     * ROOT
     *
     * Hanya /
     */

    if (route === "/") {
      return pathname === "/";
    }

    /*
     * ROUTE LAIN
     *
     * /realtime
     * /realtime/PS01
     * /realtime/PS02
     *
     * /settings
     * /settings/...
     */

    return pathname === route || pathname.startsWith(`${route}/`);
  });
}

export default function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const { user, profile, loading } = useAuth();

  useEffect(() => {
    /*
     * AUTH MASIH LOADING
     */

    if (loading) {
      return;
    }

    /*
     * LOGIN PAGE
     *
     * Jangan diproteksi.
     */

    if (pathname === "/login") {
      return;
    }

    /*
     * BELUM LOGIN
     */

    if (!user) {
      router.replace("/login");
      return;
    }

    /*
     * PROFILE BELUM ADA
     */

    if (!profile) {
      return;
    }

    const role = profile.role;

    console.log("=================================");
    console.log("🔐 ROLE GUARD");
    console.log("USER:", user.email);
    console.log("ROLE:", role);
    console.log("PATH:", pathname);
    console.log("=================================");

    /*
     * ===============================================
     * ADMIN
     * ===============================================
     *
     * Admin boleh membuka semuanya.
     */

    if (role === "admin") {
      return;
    }

    /*
     * ===============================================
     * OPERATIONAL
     * ===============================================
     */

    if (role === "operational") {
      const allowed = isOperationalAllowed(pathname);

      if (!allowed) {
        console.warn("🚫 OPERATIONAL ACCESS DENIED:", pathname);

        router.replace("/realtime");

        return;
      }
    }
  }, [loading, user, profile, pathname, router]);

  /*
   * ===============================================
   * LOADING AUTH
   * ===============================================
   */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

          <p className="mt-4 text-sm text-slate-500">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ===============================================
   * BELUM LOGIN
   * ===============================================
   */

  if (!user && pathname !== "/login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Redirecting to login...</div>
      </div>
    );
  }

  /*
   * ===============================================
   * USER ADA TAPI PROFILE BELUM ADA
   * ===============================================
   */

  if (user && !profile && pathname !== "/login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

          <p className="mt-4 text-sm text-slate-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
