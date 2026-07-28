"use client";

export type RadioCardOption = {
  value: string;
  label: string;
  description?: string;
  // Right-aligned emphasis, e.g. a price.
  meta?: string;
  disabled?: boolean;
  disabledReason?: string;
};

// A radio group rendered as selectable cards.
//
// Unlike Toggle, this emits a real <input type="radio" name=...>, so it needs no
// hidden-input mirroring — and it's the first choice control here with an
// `error` prop (Select has none).
export function RadioCards({
  name,
  value,
  onChange,
  options,
  error,
  columns = 1,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioCardOption[];
  error?: string;
  columns?: 1 | 3;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={
          columns === 3
            ? "grid grid-cols-1 gap-2 sm:grid-cols-3"
            : "flex flex-col gap-2"
        }
        role="radiogroup"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={[
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors",
                option.disabled
                  ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
                  : selected
                    ? "border-primary bg-primary-soft"
                    : "border-gray-300 bg-white hover:border-primary",
              ].join(" ")}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={name}
                    value={option.value}
                    checked={selected}
                    disabled={option.disabled}
                    onChange={() => onChange(option.value)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {option.label}
                  </span>
                </span>
                {option.meta && (
                  <span className="shrink-0 text-sm font-semibold text-gray-900">
                    {option.meta}
                  </span>
                )}
              </span>
              {option.description && (
                <span className="pl-6 text-xs text-gray-500">
                  {option.description}
                </span>
              )}
              {option.disabled && option.disabledReason && (
                <span className="pl-6 text-xs text-amber-700">
                  {option.disabledReason}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
