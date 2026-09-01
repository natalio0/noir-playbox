import { adminDb } from "@/lib/firebase-admin";
import { listRegisteredDevicesForUser } from "@/lib/device-registry";
import { parseDeviceRuntime, toRuntimeIso } from "@/lib/device-runtime";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeRuntime(
  deviceId: string,
  data: FirebaseFirestore.DocumentData | undefined,
) {
  const parsed = parseDeviceRuntime(deviceId, data);

  return {
    deviceId,
    preparing: parsed?.preparingId
      ? {
          id: parsed.preparingId,
          startedAt: toRuntimeIso(parsed.preparingStartedAt),
        }
      : null,
    session: parsed?.activeSessionId
      ? {
          id: parsed.activeSessionId,
          deviceId,
          startedAt: toRuntimeIso(parsed.sessionStartedAt),
          totalMinutes: parsed.sessionTotalMinutes,
          totalPrice: parsed.sessionTotalPrice,
        }
      : null,
    shutdown:
      parsed?.shutdownId && parsed.shutdownStatus
        ? {
            id: parsed.shutdownId,
            status: parsed.shutdownStatus,
            startedAt: toRuntimeIso(parsed.shutdownStartedAt),
            sourceSessionId: parsed.sourceSessionId,
          }
        : null,
  };
}

/**
 * Resource-optimized Android overview.
 *
 * Normal refresh reads only device_runtime documents for the operator's cafe.
 * Registry metadata is optional and requested by Android only at boot / every
 * few minutes, so device documents and cafe names are not re-read each cycle.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const url = new URL(request.url);
    const includeRegistry = url.searchParams.get("includeRegistry") === "1";

    const profileCafeId =
      typeof user.profile.cafeId === "string" && user.profile.cafeId.trim()
        ? user.profile.cafeId.trim()
        : null;

    let runtimeQuery: FirebaseFirestore.Query = adminDb.collection("device_runtime");

    if (user.profile.role === "operational") {
      if (!profileCafeId) {
        return Response.json({
          success: true,
          devices: [],
          runtimes: [],
          generatedAt: new Date().toISOString(),
        });
      }
      runtimeQuery = runtimeQuery.where("cafeId", "==", profileCafeId);
    }

    const [runtimeSnapshot, devices] = await Promise.all([
      runtimeQuery.get(),
      includeRegistry
        ? listRegisteredDevicesForUser(user.profile)
        : Promise.resolve([]),
    ]);

    const runtimes = runtimeSnapshot.docs.map((doc) => {
      const deviceId = String(doc.data().deviceId ?? doc.id).trim().toUpperCase();
      return serializeRuntime(deviceId, doc.data());
    });

    return Response.json(
      {
        success: true,
        devices: includeRegistry ? devices : undefined,
        runtimes,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil operator overview";
    const resourceExhausted =
      /RESOURCE_EXHAUSTED|quota|daily usage limits?/i.test(message);
    const unauthorized = message === "UNAUTHORIZED";

    return Response.json(
      {
        success: false,
        error: resourceExhausted
          ? "Firestore sedang mencapai batas penggunaan. Coba kembali beberapa saat lagi."
          : unauthorized
            ? "Unauthorized"
            : message,
        code: resourceExhausted ? "RESOURCE_EXHAUSTED" : undefined,
      },
      {
        status: unauthorized ? 401 : resourceExhausted ? 429 : 500,
        headers: resourceExhausted ? { "Retry-After": "60" } : undefined,
      },
    );
  }
}
