export type PaymentPackage = {
  id: string;
  label: string;
  durationMinutes: number;
  price: number;
};

// Keep this catalog aligned with Android RentalPackage values.
// Server-side validation prevents a modified client from changing payment amount.
export const PAYMENT_PACKAGES: readonly PaymentPackage[] = [
  { id: "1h", label: "1 Jam", durationMinutes: 60, price: 12_000 },
  { id: "2h", label: "2 Jam", durationMinutes: 120, price: 22_000 },
  { id: "3h", label: "3 Jam", durationMinutes: 180, price: 30_000 },
  { id: "5h", label: "5 Jam", durationMinutes: 300, price: 45_000 },
  { id: "10h", label: "10 Jam", durationMinutes: 600, price: 80_000 },
] as const;

export function getPaymentPackage(packageId: string): PaymentPackage | null {
  const id = packageId.trim();
  return PAYMENT_PACKAGES.find((item) => item.id === id) ?? null;
}
