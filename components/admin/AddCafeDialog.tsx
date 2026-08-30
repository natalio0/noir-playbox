"use client";

import {
  Plus,
  X,
} from "lucide-react";
import {
  useState,
} from "react";

import { auth } from "@/lib/firebase";

export default function AddCafeDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [open, setOpen] =
    useState(false);

  const [name, setName] =
    useState("");

  const [noirShare, setNoirShare] =
    useState(70);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  async function submit() {
    try {
      setLoading(true);
      setError(null);

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
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${token}`,
            },
            body:
              JSON.stringify({
                name,
                revenueShareNoir:
                  noirShare,
                revenueShareCafe:
                  100 -
                  noirShare,
              }),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Gagal membuat cafe",
        );
      }

      setOpen(false);
      setName("");
      setNoirShare(70);
      onCreated();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Gagal membuat cafe",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setOpen(true)
        }
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        <Plus size={17} />
        Tambah Cafe
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="font-bold text-slate-900">
                  Tambah Cafe
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Cafe ID dibuat otomatis dari nama.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">
                  Nama Cafe
                </span>
                <input
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value,
                    )
                  }
                  placeholder="Contoh: Kopi Tengah Cafe"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">
                  Noir Share
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={
                      noirShare
                    }
                    onChange={(e) =>
                      setNoirShare(
                        Math.min(
                          100,
                          Math.max(
                            0,
                            Number(
                              e.target.value,
                            ),
                          ),
                        ),
                      )
                    }
                    className="w-28 rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />

                  <p className="text-sm text-slate-500">
                    Noir {noirShare}% · Cafe {100 - noirShare}%
                  </p>
                </div>
              </label>

              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  void submit()
                }
                disabled={
                  loading ||
                  !name.trim()
                }
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {loading
                  ? "Menyimpan..."
                  : "Buat Cafe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
