export type CafeRecord = {
  id: string;
  name: string;
  revenueShareNoir: number;
  revenueShareCafe: number;
  active: boolean;
};

export function getCafeDisplayName(
  cafeId?: string | null,
  cafes?: CafeRecord[],
) {
  if (!cafeId) {
    return "-";
  }

  const matched = cafes?.find(
    (cafe) => cafe.id === cafeId,
  );

  if (matched) {
    return matched.name;
  }

  return cafeId
    .split("-")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}
