"use client";

import { ReactNode } from "react";

import { useAuth } from "@/components/providers/AuthProvider";

import { UserRole } from "@/lib/auth";

type RoleGuardProps = {
  allowedRoles: UserRole[];
  children: ReactNode;
};

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Checking permission...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>

          <p className="mt-2 text-sm text-slate-500">
            Anda tidak memiliki akses.
          </p>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>

          <p className="mt-2 text-sm text-slate-500">
            Role Anda tidak memiliki akses ke halaman ini.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
