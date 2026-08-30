import crypto from "crypto";

import { runPreparingWatchdog } from "@/lib/preparing-watchdog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function json(
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);

  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return Response.json(body, {
    ...init,
    headers,
  });
}

function getExpectedSecret() {
  /*
   * Production:
   * gunakan CRON_SECRET di Vercel.
   *
   * WATCHDOG_SECRET dipertahankan sebagai fallback
   * agar local test lama tidak langsung rusak.
   */
  return (
    process.env.CRON_SECRET ??
    process.env.WATCHDOG_SECRET ??
    null
  );
}

function readBearerToken(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );

  return match?.[1]?.trim() || null;
}

function safeEqual(
  supplied: string,
  expected: string,
) {
  const suppliedBuffer =
    Buffer.from(supplied, "utf8");
  const expectedBuffer =
    Buffer.from(expected, "utf8");

  if (
    suppliedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    suppliedBuffer,
    expectedBuffer,
  );
}

function authorizeCron(request: Request) {
  const expected = getExpectedSecret();

  /*
   * Fail closed.
   * Endpoint tidak boleh pernah terbuka jika secret lupa diset.
   */
  if (!expected) {
    return {
      ok: false as const,
      status: 503,
      error:
        "Cron secret belum dikonfigurasi",
    };
  }

  const supplied =
    readBearerToken(request);

  if (
    !supplied ||
    !safeEqual(supplied, expected)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
    };
  }

  return {
    ok: true as const,
  };
}

async function handle(request: Request) {
  const startedAt = Date.now();
  const auth = authorizeCron(request);

  if (!auth.ok) {
    /*
     * Jangan log token/secret.
     */
    console.warn(
      "PREPARING WATCHDOG AUTH REJECTED",
      {
        status: auth.status,
        hasAuthorizationHeader:
          request.headers.has(
            "authorization",
          ),
      },
    );

    return json(
      {
        success: false,
        error: auth.error,
      },
      {
        status: auth.status,
      },
    );
  }

  const runId =
    crypto.randomUUID();

  console.log(
    "PREPARING WATCHDOG START",
    {
      runId,
      at: new Date().toISOString(),
    },
  );

  try {
    const result =
      await runPreparingWatchdog();

    const durationMs =
      Date.now() - startedAt;

    console.log(
      "PREPARING WATCHDOG COMPLETE",
      {
        runId,
        checked: result.checked,
        autoShutdown:
          result.autoShutdown,
        failed: result.failed,
        skipped: result.skipped,
        durationMs,
      },
    );

    return json({
      success: true,
      runId,
      checked: result.checked,
      autoShutdown:
        result.autoShutdown,
      failed: result.failed,
      skipped: result.skipped,
      details: result.details,
      durationMs,
      checkedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    const durationMs =
      Date.now() - startedAt;

    const message =
      error instanceof Error
        ? error.message
        : "Watchdog internal error";

    console.error(
      "PREPARING WATCHDOG FAILED",
      {
        runId,
        message,
        durationMs,
      },
    );

    /*
     * Jangan kirim stack trace atau credential detail ke caller.
     */
    return json(
      {
        success: false,
        runId,
        error:
          "Preparing watchdog gagal dijalankan",
        durationMs,
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * Vercel Cron melakukan request GET ke path
 * yang terdaftar di vercel.json.
 */
export async function GET(
  request: Request,
) {
  return handle(request);
}

/*
 * Dipertahankan untuk test/manual system call
 * yang sudah ada.
 */
export async function POST(
  request: Request,
) {
  return handle(request);
}
