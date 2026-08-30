"use client";

export type CafeOption = {
  id: string;
  name: string;
};

export default function CafeFilter({
  value,
  cafes,
  onChange,
}: {
  value: string;
  cafes: CafeOption[];
  onChange: (
    value: string,
  ) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(
          event.target.value,
        )
      }
      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-400"
    >
      <option value="all">
        Semua Cafe
      </option>

      {cafes.map(
        (cafe) => (
          <option
            key={cafe.id}
            value={cafe.id}
          >
            {cafe.name}
          </option>
        ),
      )}
    </select>
  );
}
