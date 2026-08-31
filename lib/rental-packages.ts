export const RENTAL_PACKAGES = [
  {
    id: "1h",
    name: "1 Jam",
    durationMinutes: 60,
    price: 12000,
    saving: 0,
  },
  {
    id: "2h",
    name: "2 Jam",
    durationMinutes: 120,
    price: 22000,
    saving: 2000,
  },
  {
    id: "3h",
    name: "3 Jam",
    durationMinutes: 180,
    price: 30000,
    saving: 6000,
  },
  {
    id: "5h",
    name: "5 Jam",
    durationMinutes: 300,
    price: 45000,
    saving: 15000,
  },
  {
    id: "10h",
    name: "10 Jam",
    durationMinutes: 600,
    price: 80000,
    saving: 40000,
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

  // Backward-compatible fallback for a client still sending the old payload.
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
