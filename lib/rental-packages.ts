export const RENTAL_PACKAGES = [
  {
    id: "1h",
    name: "1 Jam",
    durationMinutes: 60,
    price: 12_000,
    saving: 0,
  },
  {
    id: "2h",
    name: "2 Jam",
    durationMinutes: 120,
    price: 24_000,
    saving: 0,
  },
  {
    id: "3h",
    name: "3 Jam",
    durationMinutes: 180,
    price: 36_000,
    saving: 0,
  },
  {
    id: "4h",
    name: "4 Jam",
    durationMinutes: 240,
    price: 48_000,
    saving: 0,
  },
  {
    id: "5h",
    name: "5 Jam",
    durationMinutes: 300,
    price: 60_000,
    saving: 0,
  },
  {
    id: "6h",
    name: "6 Jam",
    durationMinutes: 360,
    price: 72_000,
    saving: 0,
  },
  {
    id: "7h",
    name: "7 Jam",
    durationMinutes: 420,
    price: 84_000,
    saving: 0,
  },
  {
    id: "8h",
    name: "8 Jam",
    durationMinutes: 480,
    price: 96_000,
    saving: 0,
  },
  {
    id: "9h",
    name: "9 Jam",
    durationMinutes: 540,
    price: 108_000,
    saving: 0,
  },
  {
    id: "10h",
    name: "10 Jam",
    durationMinutes: 600,
    price: 120_000,
    saving: 0,
  },
] as const;

export type RentalPackage = (typeof RENTAL_PACKAGES)[number];

export function resolveRentalPackage(input: {
  packageId?: unknown;
  name?: unknown;
  durationMinutes?: unknown;
  price?: unknown;
}): RentalPackage | null {
  const packageId = String(input.packageId ?? "").trim();

  if (packageId) {
    return RENTAL_PACKAGES.find((item) => item.id === packageId) ?? null;
  }

  const name = String(input.name ?? "").trim();
  const durationMinutes = Number(input.durationMinutes ?? NaN);
  const price = Number(input.price ?? NaN);

  if (!name || !Number.isFinite(durationMinutes) || !Number.isFinite(price)) {
    return null;
  }

  return (
    RENTAL_PACKAGES.find(
      (item) =>
        item.name === name &&
        item.durationMinutes === durationMinutes &&
        item.price === price,
    ) ?? null
  );
}
