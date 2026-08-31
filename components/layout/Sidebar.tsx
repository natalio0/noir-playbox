"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";

import {
  LayoutDashboard,
  Radio,
  BarChart3,
  History,
  FileText,
  Building2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { getCafeDisplayName } from "@/lib/cafes";
import { useAuth } from "@/components/providers/AuthProvider";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;

  // khusus mobile
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const { profile } = useAuth();

  const pathname = usePathname();

  const isAdmin = profile?.role === "admin";

  async function handleLogout() {
    try {
      await signOut(auth);
      onMobileClose?.();
    } catch (error) {
      console.error("LOGOUT ERROR:", error);
    }
  }

  function handleMobileNavigation() {
    onMobileClose?.();
  }

  return (
    <>
      {/* =====================================================
          MOBILE BACKDROP
      ====================================================== */}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* =====================================================
          SIDEBAR
      ====================================================== */}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-screen flex-col
          border-r border-slate-200 bg-white
          shadow-xl transition-all duration-300 lg:shadow-none

          ${
            mobileOpen
              ? "translate-x-0 pointer-events-auto"
              : "-translate-x-full pointer-events-none lg:translate-x-0 lg:pointer-events-auto"
          }

          ${collapsed ? "lg:w-20" : "lg:w-64"}

          w-[280px]
        `}
      >
        {/* =================================================
              LOGO
          ================================================== */}

        <div className="relative flex h-28 items-center justify-center border-b border-slate-200 px-4">
          <Link
            prefetch={false}
            href={isAdmin ? "/admin" : "/"}
            onClick={handleMobileNavigation}
            className="flex items-center justify-center"
          >
            <Image
              src="/images/logo-noir-playbox.jpeg"
              alt="Noir Playbox"
              width={160}
              height={80}
              priority
              className={`h-auto object-contain transition-all duration-300 ${
                collapsed ? "w-12 lg:w-12" : "w-32 lg:w-36"
              }`}
            />
          </Link>

          {/* CLOSE MOBILE */}

          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close sidebar"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          >
            <X size={19} />
          </button>
        </div>

        {/* =================================================
            USER ROLE
        ================================================== */}

        {profile && (
          <>
            {/* DESKTOP */}

            {!collapsed && (
              <div className="hidden border-b border-slate-100 px-5 py-4 lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Role
                </p>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold capitalize text-slate-800">
                    {profile.role}
                  </p>

                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>

                {profile.cafeId && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {getCafeDisplayName(profile.cafeId)}
                  </p>
                )}
              </div>
            )}

            {/* MOBILE */}

            <div className="border-b border-slate-100 px-5 py-4 lg:hidden">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Role
              </p>

              <div className="mt-1 flex items-center justify-between">
                <p className="text-sm font-semibold capitalize text-slate-800">
                  {profile.role}
                </p>

                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>

              {profile.cafeId && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {getCafeDisplayName(profile.cafeId)}
                </p>
              )}
            </div>
          </>
        )}

        {/* =================================================
            NAVIGATION
        ================================================== */}

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {/* OVERVIEW */}

          <NavItem
            icon={<LayoutDashboard size={19} />}
            label="Overview"
            collapsed={collapsed}
            href={isAdmin ? "/admin" : "/"}
            pathname={pathname}
            onNavigate={handleMobileNavigation}
          />

          {/* MONITORING */}

          <SectionLabel label="Monitoring" collapsed={collapsed} />

          <NavItem
            icon={<Radio size={19} />}
            label="Realtime"
            collapsed={collapsed}
            href="/realtime"
            pathname={pathname}
            onNavigate={handleMobileNavigation}
          />

          {isAdmin && (
            <NavItem
              icon={<Building2 size={19} />}
              label="Cafes"
              collapsed={collapsed}
              href="/cafes"
              pathname={pathname}
              onNavigate={handleMobileNavigation}
            />
          )}

          {/* ADMIN ONLY */}

          {isAdmin && (
            <>
              <SectionLabel label="Analytics" collapsed={collapsed} />

              <NavItem
                icon={<BarChart3 size={19} />}
                label="Daily"
                collapsed={collapsed}
                href="/analytics/daily"
                pathname={pathname}
                onNavigate={handleMobileNavigation}
              />

              <NavItem
                icon={<BarChart3 size={19} />}
                label="7 Days"
                collapsed={collapsed}
                href="/analytics/7-days"
                pathname={pathname}
                onNavigate={handleMobileNavigation}
              />

              <NavItem
                icon={<BarChart3 size={19} />}
                label="30 Days"
                collapsed={collapsed}
                href="/analytics/30-days"
                pathname={pathname}
                onNavigate={handleMobileNavigation}
              />

              <SectionLabel label="History" collapsed={collapsed} />

              <NavItem
                icon={<History size={19} />}
                label="Sessions"
                collapsed={collapsed}
                href="/history"
                pathname={pathname}
                onNavigate={handleMobileNavigation}
              />

              <SectionLabel label="Reports" collapsed={collapsed} />

              <NavItem
                icon={<FileText size={19} />}
                label="Monthly Report"
                collapsed={collapsed}
                href="/reports/monthly"
                pathname={pathname}
                onNavigate={handleMobileNavigation}
              />
            </>
          )}

          {/* SYSTEM */}

          <SectionLabel label="System" collapsed={collapsed} />

          <NavItem
            icon={<Settings size={19} />}
            label="Settings"
            collapsed={collapsed}
            href="/settings"
            pathname={pathname}
            onNavigate={handleMobileNavigation}
          />
        </nav>

        {/* =================================================
            FOOTER
        ================================================== */}

        <div className="space-y-2 border-t border-slate-200 p-4">
          {/* LOGOUT */}

          <button
            onClick={handleLogout}
            className={`
              flex w-full items-center rounded-lg px-3 py-2.5
              text-sm text-red-500 transition
              hover:bg-red-50 hover:text-red-600

              ${collapsed ? "lg:justify-center" : "gap-3"}
            `}
          >
            <LogOut size={18} />

            {!collapsed && (
              <span className="hidden whitespace-nowrap lg:inline">Logout</span>
            )}

            <span className="whitespace-nowrap lg:hidden">Logout</span>
          </button>

          {/* DESKTOP COLLAPSE */}

          <button
            onClick={onToggle}
            className="hidden w-full items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-blue-600 lg:flex"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>
    </>
  );
}

/* =======================================================
   SECTION LABEL
======================================================= */

function SectionLabel({
  label,
  collapsed,
}: {
  label: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    return <div className="my-4 hidden border-t border-slate-100 lg:block" />;
  }

  return (
    <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
      {label}
    </p>
  );
}

/* =======================================================
   NAV ITEM
======================================================= */

function NavItem({
  icon,
  label,
  collapsed,
  href,
  pathname,
  onNavigate,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  href: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      prefetch={false}
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={`
        group flex w-full items-center rounded-lg px-3 py-2.5
        text-sm font-medium transition

        ${collapsed ? "lg:justify-center" : "gap-3"}

        ${
          isActive
            ? "bg-blue-50 text-blue-600"
            : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"
        }
      `}
    >
      <span
        className={`shrink-0 transition ${isActive ? "text-blue-600" : ""}`}
      >
        {icon}
      </span>

      {!collapsed && (
        <span className="hidden whitespace-nowrap lg:inline">{label}</span>
      )}

      <span className="whitespace-nowrap lg:hidden">{label}</span>

      {isActive && !collapsed && (
        <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-blue-600 lg:block" />
      )}
    </Link>
  );
}
