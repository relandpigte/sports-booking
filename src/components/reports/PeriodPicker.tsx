import { MONTHS } from "@/lib/constants";

// Month, year and grain as a plain GET form.
//
// The URL is the filter: no client state, no "Refresh" button, and a report
// someone is looking at can be pasted to someone else. Back and forward work
// because they always did.
//
// It sits ABOVE the cards rather than inside one — a filter that lives in a
// chart card looks like it only filters that chart.
export function PeriodPicker({
  action,
  year,
  month,
  grain,
  hidden = {},
  extra,
}: {
  // The page this filters, e.g. "/dashboard/reports".
  action: string;
  year: number;
  month: number;
  grain: "day" | "month";
  // Any other searchParams that must survive a submit (the admin's tab, say).
  hidden?: Record<string, string | undefined>;
  // An optional extra control, e.g. the partner's hub selector.
  extra?: React.ReactNode;
}) {
  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  const select =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none";

  return (
    <form
      action={action}
      method="get"
      className="flex flex-wrap items-end justify-end gap-2"
    >
      {Object.entries(hidden).map(([name, value]) =>
        value ? (
          <input key={name} type="hidden" name={name} value={value} />
        ) : null
      )}

      {extra}

      <select name="grain" defaultValue={grain} className={select} aria-label="Grain">
        <option value="day">Daily</option>
        <option value="month">Monthly</option>
      </select>

      {/* The month is meaningless at month grain — that view is the twelve
          months ending with the chosen year. */}
      <select
        name="month"
        defaultValue={String(month)}
        className={select}
        aria-label="Month"
      >
        {MONTHS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>

      <select
        name="year"
        defaultValue={String(year)}
        className={select}
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover"
      >
        Show
      </button>
    </form>
  );
}
