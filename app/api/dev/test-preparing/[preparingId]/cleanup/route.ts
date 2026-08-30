import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      preparingId: string;
    }>;
  },
) {
  try {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        {
          success: false,
          error: "Endpoint test tidak tersedia di production",
        },
        { status: 403 },
      );
    }

    const user = await requireUserFromRequest(request);

    if (user.profile?.role !== "admin") {
      return Response.json(
        {
          success: false,
          error: "Admin only",
        },
        { status: 403 },
      );
    }

    const { preparingId } = await context.params;

    const ref = adminDb
      .collection("preparing_sessions")
      .doc(preparingId);

    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return Response.json(
        {
          success: false,
          error: "Preparing test tidak ditemukan",
        },
        { status: 404 },
      );
    }

    const data = snapshot.data()!;

    if (data.testMode !== true) {
      return Response.json(
        {
          success: false,
          error:
            "Cleanup hanya boleh untuk record testMode=true",
        },
        { status: 403 },
      );
    }

    await ref.delete();

    return Response.json({
      success: true,
      preparingId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal cleanup PREPARING test";

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
