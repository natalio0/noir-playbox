import {
  runPreparingWatchdog,
} from "@/lib/preparing-watchdog";
import {
  requireUserFromRequest,
} from "@/lib/require-dashboard-user";

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
          error: "Admin only",
        },
        { status: 403 },
      );
    }

    const result =
      await runPreparingWatchdog();

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Watchdog gagal";

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
