import { adminDb } from "@/lib/firebase-admin";
import { TUYA_DEVICES } from "@/lib/tuya-devices";

export type RegisteredDevice = {
  deviceId: string;
  name: string;
  cafeId: string | null;
  tuyaDeviceId: string;
  active: boolean;
  brand: string | null;
  model: string | null;
  type: string | null;
};

export type ListedRegisteredDevice = {
  id: string;
  deviceId: string;
  name: string;
  cafeId: string | null;
  cafeName: string | null;
  tuyaDeviceId: string | null;
  active: boolean;
  brand: string | null;
  model: string | null;
  type: string | null;
};

const registryListCache = new Map<
  string,
  { expiresAt: number; devices: ListedRegisteredDevice[] }
>();

const REGISTRY_CACHE_MS = 30_000;

export function invalidateRegisteredDeviceCache() {
  registryListCache.clear();
}

export async function resolveRegisteredDevice(
  logicalDeviceId: string,
): Promise<RegisteredDevice | null> {
  const deviceId =
    logicalDeviceId.trim().toUpperCase();

  const snapshot =
    await adminDb
      .collection("devices")
      .doc(deviceId)
      .get();

  if (snapshot.exists) {
    const data = snapshot.data()!;

    const tuyaDeviceId =
      String(
        data.tuyaDeviceId ?? "",
      ).trim();

    if (tuyaDeviceId) {
      return {
        deviceId,
        name: String(
          data.name ?? deviceId,
        ),
        cafeId:
          typeof data.cafeId === "string"
            ? data.cafeId
            : null,
        tuyaDeviceId,
        active:
          data.active !== false,
        brand:
          data.brand
            ? String(data.brand)
            : null,
        model:
          data.model
            ? String(data.model)
            : null,
        type:
          data.type
            ? String(data.type)
            : null,
      };
    }
  }

  /*
   * Temporary backward compatibility only.
   * PS01-PS05 tetap bisa bekerja jika salah satu dokumen
   * Firestore belum memiliki tuyaDeviceId.
   */
  const legacy =
    TUYA_DEVICES[deviceId];

  if (!legacy) {
    return null;
  }

  return {
    deviceId,
    name: legacy.name,
    cafeId: null,
    tuyaDeviceId:
      legacy.deviceId,
    active: true,
    brand: "BARDI",
    model: "Smart Plug",
    type: "SMART_PLUG",
  };
}

export async function listRegisteredDevicesForUser(
  profile:
    | Record<string, unknown>
    | null
    | undefined,
  options: { includeCafeNames?: boolean } = {},
): Promise<ListedRegisteredDevice[]> {
  const includeCafeNames = options.includeCafeNames !== false;
  const role =
    typeof profile?.role ===
    "string"
      ? profile.role
      : "";

  const profileCafeId =
    typeof profile?.cafeId ===
    "string"
      ? profile.cafeId
      : null;

  const cacheKey = `${role}:${profileCafeId ?? "-"}:${includeCafeNames ? "names" : "no-names"}`;
  const cached = registryListCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.devices;
  }

  let query:
    FirebaseFirestore.Query =
    adminDb
      .collection("devices");

  if (
    role === "operational"
  ) {
    if (!profileCafeId) {
      return [];
    }

    query = query.where(
      "cafeId",
      "==",
      profileCafeId,
    );
  }

  const snapshot =
    await query.get();

  const cafeIds =
    Array.from(
      new Set(
        snapshot.docs
          .map((doc) => {
            const value =
              doc.data()
                .cafeId;

            return typeof value ===
              "string"
              ? value
              : null;
          })
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),
      ),
    );

  const cafeDocs = includeCafeNames
    ? await Promise.all(
        cafeIds.map((id) =>
          adminDb
            .collection("cafes")
            .doc(id)
            .get(),
        ),
      )
    : [];

  const cafeNames =
    new Map<string, string>();

  for (
    const cafeDoc of
    cafeDocs
  ) {
    if (!cafeDoc.exists) {
      continue;
    }

    cafeNames.set(
      cafeDoc.id,
      String(
        cafeDoc.data()?.name ??
          cafeDoc.id,
      ),
    );
  }

  const devices = snapshot.docs
    .map((doc) => {
      const data =
        doc.data();

      const deviceId =
        String(
          data.deviceId ??
            doc.id,
        ).toUpperCase();

      const cafeId =
        typeof data.cafeId ===
        "string"
          ? data.cafeId
          : null;

      return {
        id: deviceId,
        deviceId,
        name: String(
          data.name ??
            deviceId,
        ),
        cafeId,
        cafeName:
          includeCafeNames && cafeId
            ? cafeNames.get(cafeId) ?? cafeId
            : null,
        tuyaDeviceId:
          typeof data.tuyaDeviceId ===
          "string"
            ? data.tuyaDeviceId
            : null,
        active:
          data.active !==
          false,
        brand:
          data.brand
            ? String(
                data.brand,
              )
            : null,
        model:
          data.model
            ? String(
                data.model,
              )
            : null,
        type:
          data.type
            ? String(
                data.type,
              )
            : null,
      };
    })
    .filter(
      (device) =>
        device.active &&
        Boolean(
          device.tuyaDeviceId,
        ),
    )
    .sort((a, b) => {
      const cafeCompare =
        String(
          a.cafeName ?? "",
        ).localeCompare(
          String(
            b.cafeName ?? "",
          ),
        );

      if (cafeCompare) {
        return cafeCompare;
      }

      return a.deviceId.localeCompare(
        b.deviceId,
      );
    });

  registryListCache.set(cacheKey, {
    expiresAt: Date.now() + REGISTRY_CACHE_MS,
    devices,
  });

  return devices;
}

export function canAccessDevice(
  profile:
    | Record<string, unknown>
    | null
    | undefined,
  device: RegisteredDevice,
) {
  const role =
    typeof profile?.role ===
    "string"
      ? profile.role
      : "";

  if (role === "admin") {
    return true;
  }

  if (
    role === "operational"
  ) {
    return (
      typeof profile?.cafeId ===
        "string" &&
      profile.cafeId ===
        device.cafeId
    );
  }

  return false;
}
