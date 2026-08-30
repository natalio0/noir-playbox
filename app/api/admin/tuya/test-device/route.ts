import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { getRawTuyaDevice } from "@/lib/tuya-raw";

export async function POST(
  request: Request,
) {
  try {
    const user =
      await requireUserFromRequest(
        request,
      );

    if (
      user.profile?.role !==
      "admin"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Akses hanya untuk admin",
        },
        { status: 403 },
      );
    }

    const body =
      await request.json();

    const tuyaDeviceId =
      String(
        body.tuyaDeviceId ??
          "",
      ).trim();

    if (!tuyaDeviceId) {
      return Response.json(
        {
          success: false,
          error:
            "Tuya Device ID wajib diisi",
        },
        { status: 400 },
      );
    }

    const device =
      await getRawTuyaDevice(
        tuyaDeviceId,
      );

    return Response.json({
      success: true,
      device: {
        id: device.id,
        name: device.name,
        online:
          device.online,
        category:
          device.category,
        productId:
          device.productId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal test Tuya";

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
