export type PaymentPackage = {
  id: string;
  label: string;
  durationMinutes: number;
  price: number;
};

// Kagoengan Studio Playbox: tarif linear Rp12.000 per jam.
// Server-side validation prevents a modified client from changing the amount.
export const PAYMENT_PACKAGES: readonly PaymentPackage[] = Array.from(
  { length: 10 },
  (_, index) => {
    const hours = index + 1;
    return {
      id: `${hours}h`,
      label: `${hours} Jam`,
      durationMinutes: hours * 60,
      price: hours * 12_000,
    };
  },
);

export function getPaymentPackage(packageId: string): PaymentPackage | null {
  const id = packageId.trim();
  return PAYMENT_PACKAGES.find((item) => item.id === id) ?? null;
}
