import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);

    const body = await request.json();

    const deviceId =
      String(
        body.deviceId || "",
      )
        .trim()
        .toUpperCase();

    const durationMinutes =
      Number(
        body.durationMinutes ?? 0,
      );

    const durationSeconds =
      Number(
        body.durationSeconds ??
          durationMinutes * 60,
      );

    const packageName =
      String(
        body.packageName || "",
      ).trim();

    const price =
      Number(
        body.price ?? 0,
      );

    if (!deviceId) {
      return Response.json(
        {
          success: false,
          error:
            "deviceId wajib diisi",
        },
        { status: 400 },
      );
    }

    const deviceDoc =
      await adminDb
        .collection("devices")
        .doc(deviceId)
        .get();

    if (!deviceDoc.exists) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} belum terdaftar di collection devices`,
        },
        { status: 400 },
      );
    }

    const deviceData =
      deviceDoc.data()!;

    const cafeId =
      typeof deviceData.cafeId ===
        "string"
        ? deviceData.cafeId
        : "";

    if (!cafeId) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} belum memiliki cafeId`,
        },
        { status: 400 },
      );
    }

    if (
      user.profile?.role ===
        "operational" &&
      user.profile?.cafeId !==
        cafeId
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Operational tidak memiliki akses ke cafe device ini",
        },
        { status: 403 },
      );
    }

    const activeSnapshot =
      await adminDb
        .collection("sessions")
        .where(
          "deviceId",
          "==",
          deviceId,
        )
        .where(
          "status",
          "==",
          "ACTIVE",
        )
        .limit(1)
        .get();

    if (
      !activeSnapshot.empty
    ) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} masih memiliki session ACTIVE`,
        },
        { status: 409 },
      );
    }

    const sessionRef =
      adminDb
        .collection("sessions")
        .doc();

    const packageRef =
      sessionRef
        .collection("packages")
        .doc();

    const batch =
      adminDb.batch();

    batch.set(
      sessionRef,
      {
        deviceId,
        cafeId,

        status: "ACTIVE",

        startedAt:
          FieldValue
            .serverTimestamp(),

        endedAt: null,

        totalMinutes:
          durationMinutes,

        totalPrice:
          price,

        operatorUid:
          user.uid,

        operatorEmail:
          user.email ?? null,

        createdAt:
          FieldValue
            .serverTimestamp(),

        updatedAt:
          FieldValue
            .serverTimestamp(),
      },
    );

    batch.set(
      packageRef,
      {
        name: packageName,
        durationMinutes,
        durationSeconds,
        price,
        type: "INITIAL",
        addedAt:
          FieldValue
            .serverTimestamp(),
      },
    );

    await batch.commit();

    return Response.json({
      success: true,
      sessionId:
        sessionRef.id,
      cafeId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal membuat session";

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
