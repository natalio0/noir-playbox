import {
  listRegisteredDevicesForUser,
} from "@/lib/device-registry";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function GET(
  request: Request,
) {
  try {
    const user =
      await requireUserFromRequest(
        request,
      );

    const devices =
      await listRegisteredDevicesForUser(
        user.profile,
      );

    return Response.json({
      success: true,
      devices,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil devices";

    return Response.json(
      {
        success: false,
        error:
          message ===
          "UNAUTHORIZED"
            ? "Unauthorized"
            : message,
      },
      {
        status:
          message ===
          "UNAUTHORIZED"
            ? 401
            : 500,
      },
    );
  }
}
