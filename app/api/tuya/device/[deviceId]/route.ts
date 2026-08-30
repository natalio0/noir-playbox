import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { getDynamicTuyaState } from "@/lib/tuya-cloud-dynamic";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      deviceId: string;
    }>;
  },
) {
  try {
    const user =
      await requireUserFromRequest(request);

    const { deviceId } = await context.params;

    const registered =
      await resolveRegisteredDevice(deviceId);

    if (!registered) {
      return Response.json(
        {
          success: false,
          error: "PlayBox belum terdaftar",
        },
        { status: 404 },
      );
    }

    if (!registered.active) {
      return Response.json(
        {
          success: false,
          error: "PlayBox tidak aktif",
        },
        { status: 403 },
      );
    }

    if (!canAccessDevice(user.profile, registered)) {
      return Response.json(
        {
          success: false,
          error: "Tidak memiliki akses ke device ini",
        },
        { status: 403 },
      );
    }

    try {
      const state = await getDynamicTuyaState(
        registered.tuyaDeviceId,
      );

      return Response.json({
        success: true,
        online: true,
        deviceId: registered.deviceId,
        cafeId: registered.cafeId,
        state,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Device offline";

      const normalized = message.toLowerCase();

      const offline =
        normalized.includes("offline") ||
        normalized.includes("not online") ||
        normalized.includes("device is offline") ||
        message.includes("40000801");

      if (offline) {
        return Response.json({
          success: true,
          online: false,
          deviceId: registered.deviceId,
          cafeId: registered.cafeId,
          state: null,
          updatedAt: new Date().toISOString(),
        });
      }

      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil status Tuya";

    console.error("TUYA DEVICE V2 ERROR:", message);

    return Response.json(
      {
        success: false,
        error:
          message === "UNAUTHORIZED"
            ? "Unauthorized"
            : message,
      },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}
