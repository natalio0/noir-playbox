"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getAuthenticatedProfile } from "@/lib/auth-profile-client";

import { Lock, Mail, Loader2, LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [error, setError] = useState("");

  /* =====================================================
     CHECK EXISTING LOGIN
  ===================================================== */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/");
      } else {
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  /* =====================================================
     LOGIN
  ===================================================== */

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!email.trim()) {
      setError("Email wajib diisi.");
      return;
    }

    if (!password) {
      setError("Password wajib diisi.");
      return;
    }

    try {
      setLoading(true);

      /* =================================================
         FIREBASE LOGIN
      ================================================= */

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      const firebaseUser = credential.user;

      console.log("🔥 FIREBASE LOGIN SUCCESS:", firebaseUser.uid);

      /*
       * Login page dan AuthProvider memakai request profile yang sama.
       * Jika onAuthStateChanged berjalan bersamaan, request tidak diduplikasi.
       */
      const profile =
        await getAuthenticatedProfile(firebaseUser);

      /* =================================================
         ROLE
      ================================================= */

      const role = profile.role;

      console.log("🔥 USER ROLE:", role);

      /* =================================================
         REDIRECT
      ================================================= */

      if (role === "operational") {
        router.replace("/realtime");
        return;
      }

      if (role === "admin") {
        router.replace("/");
        return;
      }

      await auth.signOut();

      throw new Error("Role user tidak valid.");
    } catch (error) {
      console.error("LOGIN ERROR:", error);

      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";

      switch (code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          setError("Email atau password salah.");
          break;

        case "auth/too-many-requests":
          setError("Terlalu banyak percobaan login. Coba lagi nanti.");
          break;

        case "auth/user-disabled":
          setError("Akun ini telah dinonaktifkan.");
          break;

        default:
          setError(error instanceof Error ? error.message : "Gagal login.");
      }
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     CHECKING
  ===================================================== */

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </main>
    );
  }

  /* =====================================================
     PAGE
  ===================================================== */

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* LOGO */}

        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg">
            NP
          </div>

          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            NOIR PLAYBOX
          </h1>

          <p className="mt-1 text-sm text-slate-500">Management Dashboard</p>
        </div>

        {/* LOGIN CARD */}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Welcome back</h2>

            <p className="mt-1 text-sm text-slate-500">
              Login untuk mengakses dashboard.
            </p>
          </div>

          {/* ERROR */}

          {error && (
            <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />

              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* EMAIL */}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@email.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>

              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* LOGIN */}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Login
                </>
              )}
            </button>
          </form>
        </div>

        {/* FOOTER */}

        <p className="mt-6 text-center text-xs text-slate-400">
          Noir Playbox Management System
        </p>
      </div>
    </main>
  );
}
