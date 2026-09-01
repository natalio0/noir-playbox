"use client";

import { useMemo, useState } from "react";

type Action = "status" | "on" | "off";

type PilotResponse = {
  success?: boolean;
  transport?: string;
  gatewayStatus?: number;
  error?: string;
  result?: {
    ok?: boolean;
    playboxId?: string;
    switch?: boolean | null;
    requested?: string;
    latencyMs?: number;
    raw?: unknown;
  };
};

export default function LocalGatewayPilotPage() {
  const [deviceId, setDeviceId] = useState("PS01");
  const [loadingAction, setLoadingAction] = useState<Action | null>(null);
  const [response, setResponse] = useState<PilotResponse | null>(null);

  const switchLabel = useMemo(() => {
    const value = response?.result?.switch;

    if (value === true) return "ON";
    if (value === false) return "OFF";
    return "-";
  }, [response]);

  async function run(action: Action) {
    if (loadingAction) return;

    setLoadingAction(action);
    setResponse(null);

    try {
      const res = await fetch("/api/dev/local-gateway", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          action,
        }),
      });

      const json = (await res.json()) as PilotResponse;
      setResponse(json);
    } catch (error) {
      setResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Tidak dapat menjalankan local pilot.",
      });
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            DEV ONLY · LOCAL LAN
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Noir Playbox Local Gateway Pilot
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Halaman ini hanya untuk development lokal. Status/ON/OFF dikirim ke
            TinyTuya gateway di Mac, bukan ke Tuya Cloud API Noir Playbox.
          </p>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <label className="text-sm text-white/60" htmlFor="deviceId">
            Playbox
          </label>
          <input
            id="deviceId"
            value={deviceId}
            onChange={(event) =>
              setDeviceId(event.target.value.toUpperCase().replace(/\s/g, ""))
            }
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none placeholder:text-white/25 focus:border-white/25"
            placeholder="PS01"
          />

          <div className="mt-4 grid grid-cols-3 gap-3">
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => run("status")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium disabled:opacity-40"
            >
              {loadingAction === "status" ? "Checking..." : "STATUS"}
            </button>

            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => run("on")}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium disabled:opacity-40"
            >
              {loadingAction === "on" ? "Turning ON..." : "ON"}
            </button>

            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => run("off")}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium disabled:opacity-40"
            >
              {loadingAction === "off" ? "Turning OFF..." : "OFF"}
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/35">
                Transport
              </p>
              <p className="mt-1 text-sm font-medium">
                {response?.transport ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/35">
                Result
              </p>
              <p className="mt-1 text-sm font-medium">
                {response
                  ? response.success
                    ? "SUCCESS"
                    : "FAILED"
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/35">
                Switch
              </p>
              <p className="mt-1 text-sm font-medium">{switchLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/35">
                Local latency
              </p>
              <p className="mt-1 text-sm font-medium">
                {typeof response?.result?.latencyMs === "number"
                  ? `${response.result.latencyMs} ms`
                  : "-"}
              </p>
            </div>
          </div>

          {response?.error ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
              {response.error}
            </div>
          ) : null}

          {response ? (
            <details className="mt-5">
              <summary className="cursor-pointer text-sm text-white/45">
                Raw response
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-black/40 p-4 text-xs leading-5 text-white/60">
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>

        <p className="mt-5 text-xs leading-5 text-white/35">
          Production dashboard belum berubah. Firebase billing, PREPARING,
          watchdog, shutdown, dan Tuya Cloud fallback belum terhubung ke pilot
          ini.
        </p>
      </div>
    </main>
  );
}
