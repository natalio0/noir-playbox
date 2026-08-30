"use client";

import {
  CheckCircle2,
  Loader2,
  Plus,
  Unplug,
  X,
} from "lucide-react";
import {
  useState,
} from "react";

import { auth } from "@/lib/firebase";

type TestedDevice = {
  id: string;
  name: string;
  online: boolean;
  category: string | null;
  productId: string | null;
};

export default function AddPlayBoxDialog({
  cafeId,
  cafeName,
  onCreated,
}: {
  cafeId: string;
  cafeName: string;
  onCreated: () => void;
}) {
  const [open, setOpen] =
    useState(false);

  const [deviceId, setDeviceId] =
    useState("");

  const [name, setName] =
    useState("");

  const [
    tuyaDeviceId,
    setTuyaDeviceId,
  ] = useState("");

  const [
    testedDevice,
    setTestedDevice,
  ] =
    useState<TestedDevice | null>(
      null,
    );

  const [
    testing,
    setTesting,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  async function getToken() {
    const user =
      auth.currentUser;

    if (!user) {
      throw new Error(
        "User belum login",
      );
    }

    return user.getIdToken();
  }

  async function testConnection() {
    try {
      setTesting(true);
      setError(null);
      setTestedDevice(null);

      const token =
        await getToken();

      const response =
        await fetch(
          "/api/admin/tuya/test-device",
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
                tuyaDeviceId:
                  tuyaDeviceId.trim(),
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
            "Device tidak ditemukan",
        );
      }

      setTestedDevice(
        data.device,
      );

      if (!name.trim()) {
        setName(
          String(
            data.device.name ??
              "",
          ),
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Test gagal",
      );
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    try {
      if (!testedDevice) {
        throw new Error(
          "Test Connection dulu",
        );
      }

      if (
        testedDevice.id !==
        tuyaDeviceId.trim()
      ) {
        throw new Error(
          "Tuya Device ID berubah. Test ulang.",
        );
      }

      setSaving(true);
      setError(null);

      const token =
        await getToken();

      const response =
        await fetch(
          `/api/admin/cafes/${encodeURIComponent(cafeId)}/devices`,
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
                deviceId:
                  deviceId
                    .trim()
                    .toUpperCase(),
                name:
                  name.trim(),
                tuyaDeviceId:
                  tuyaDeviceId.trim(),
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
            "Gagal menyimpan PlayBox",
        );
      }

      setOpen(false);
      reset();
      onCreated();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan PlayBox",
      );
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDeviceId("");
    setName("");
    setTuyaDeviceId("");
    setTestedDevice(null);
    setError(null);
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
        Tambah PlayBox
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="font-bold text-slate-900">
                  Tambah PlayBox
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Otomatis masuk ke {cafeName}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-700">
                Pair Smart Plug di SmartLife/Tuya terlebih dahulu, lalu masukkan Tuya Device ID di sini.
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">
                  PlayBox ID
                </span>
                <input
                  value={deviceId}
                  onChange={(e) =>
                    setDeviceId(
                      e.target.value.toUpperCase(),
                    )
                  }
                  placeholder="PS06"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">
                  Nama
                </span>
                <input
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value,
                    )
                  }
                  placeholder="Cafe B - PS06"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">
                  Tuya Device ID
                </span>

                <div className="mt-2 flex gap-2">
                  <input
                    value={
                      tuyaDeviceId
                    }
                    onChange={(e) => {
                      setTuyaDeviceId(
                        e.target.value,
                      );
                      setTestedDevice(
                        null,
                      );
                    }}
                    placeholder="a3849b95..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      void testConnection()
                    }
                    disabled={
                      testing ||
                      !tuyaDeviceId.trim()
                    }
                    className="rounded-xl border border-blue-200 px-4 py-3 text-sm font-bold text-blue-600 disabled:opacity-50"
                  >
                    {testing ? (
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />
                    ) : (
                      "Test"
                    )}
                  </button>
                </div>
              </label>

              {testedDevice && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 font-bold text-emerald-700">
                    <CheckCircle2
                      size={18}
                    />
                    Device ditemukan
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-emerald-700 sm:grid-cols-2">
                    <p>
                      Nama: {testedDevice.name}
                    </p>
                    <p>
                      Status: {testedDevice.online ? "Online" : "Offline"}
                    </p>
                    <p>
                      Category: {testedDevice.category ?? "-"}
                    </p>
                    <p>
                      ID: {testedDevice.id}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  <Unplug
                    size={17}
                    className="mt-0.5 shrink-0"
                  />
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  void save()
                }
                disabled={
                  saving ||
                  !testedDevice ||
                  !deviceId.trim()
                }
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving
                  ? "Menyimpan..."
                  : "Simpan PlayBox"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
