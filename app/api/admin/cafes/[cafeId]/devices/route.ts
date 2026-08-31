import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";
import { invalidateRegisteredDeviceCache } from "@/lib/device-registry";
import { getRawTuyaDevice } from "@/lib/tuya-raw";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      cafeId: string;
    }>;
  },
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

    const { cafeId } =
      await context.params;

    const cafeDoc =
      await adminDb
        .collection("cafes")
        .doc(cafeId)
        .get();

    if (!cafeDoc.exists) {
      return Response.json(
        {
          success: false,
          error:
            "Cafe tidak ditemukan",
        },
        { status: 404 },
      );
    }

    const body =
      await request.json();

    const deviceId =
      String(
        body.deviceId ?? "",
      )
        .trim()
        .toUpperCase();

    const name =
      String(
        body.name ?? deviceId,
      ).trim();

    const tuyaDeviceId =
      String(
        body.tuyaDeviceId ??
          "",
      ).trim();

    if (
      !/^PS[A-Z0-9_-]+$/.test(
        deviceId,
      )
    ) {
      return Response.json(
        {
          success: false,
          error:
            "PlayBox ID harus diawali PS, contoh PS06",
        },
        { status: 400 },
      );
    }

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

    const ref =
      adminDb
        .collection("devices")
        .doc(deviceId);

    const [
      existingDevice,
      tuyaDuplicate,
    ] = await Promise.all([
      ref.get(),
      adminDb
        .collection("devices")
        .where(
          "tuyaDeviceId",
          "==",
          tuyaDeviceId,
        )
        .limit(1)
        .get(),
    ]);

    if (existingDevice.exists) {
      return Response.json(
        {
          success: false,
          error:
            `${deviceId} sudah terdaftar`,
        },
        { status: 409 },
      );
    }

    if (!tuyaDuplicate.empty) {
      return Response.json(
        {
          success: false,
          error:
            "Tuya Device ID sudah dipakai PlayBox lain",
        },
        { status: 409 },
      );
    }

    /*
     * Validasi ulang server-side.
     * Jadi user tidak bisa bypass tombol Test Connection.
     */
    const tuya =
      await getRawTuyaDevice(
        tuyaDeviceId,
      );

    await ref.set({
      deviceId,
      name:
        name ||
        deviceId,
      cafeId,
      tuyaDeviceId:
        tuya.id,
      tuyaName:
        tuya.name,
      tuyaCategory:
        tuya.category,
      tuyaProductId:
        tuya.productId,
      active: true,
      createdBy:
        user.uid,
      createdAt:
        FieldValue.serverTimestamp(),
      updatedAt:
        FieldValue.serverTimestamp(),
    });

    invalidateRegisteredDeviceCache();

    return Response.json({
      success: true,
      device: {
        deviceId,
        name:
          name ||
          deviceId,
        cafeId,
        tuyaDeviceId:
          tuya.id,
        tuyaName:
          tuya.name,
        online:
          tuya.online,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal menambah PlayBox";

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
            : 400,
      },
    );
  }
}
