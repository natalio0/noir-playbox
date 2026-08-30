export const TUYA_DEVICES: Record<
  string,
  {
    deviceId: string;
    name: string;
  }
> = {
  PS01: {
    deviceId: "a3849b95d0acfacbe65lht",
    name: "BL-BOXPS01",
  },

  PS02: {
    deviceId: "a32d3ce3799396b22adjmw",
    name: "BL-PSBOX02",
  },

  PS03: {
    deviceId: "a38297ad04f1f774ea5v45",
    name: "BL-PSBOX03",
  },

  PS04: {
    deviceId: "a33f87ac29df76e537wbqh",
    name: "BL-PSBOX04",
  },

  PS05: {
    deviceId: "a3040db2a1d364439cet8b",
    name: "BL-PSBOX05",
  },
};

export function getTuyaDeviceId(psId: string) {
  const normalizedPsId = psId.toUpperCase();

  const device = TUYA_DEVICES[normalizedPsId];

  if (!device) {
    throw new Error(`Device ${normalizedPsId} belum terdaftar`);
  }

  return device.deviceId;
}
