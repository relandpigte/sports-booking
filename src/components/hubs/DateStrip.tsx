"use client";

import { addDays, formatManilaDate } from "@/lib/time";
import { BOOKING_WINDOW_DAYS } from "@/lib/constants";

// Horizontal date picker over the booking window. `today` comes from the
// server (Manila time) — never from new Date() here, since the visitor's
// device could be in any timezone.
export function DateStrip({
  today,
  value,
  onChange,
}: {
  today: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const dates = Array.from({ length: BOOKING_WINDOW_DAYS + 1 }, (_, i) =>
    addDays(today, i)
  );

  return (
    <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
      {dates.map((date) => {
        const selected = date === value;
        const [, , day] = date.split("-");
        const weekday = formatManilaDate(date).slice(0, 3);

        return (
          <button
            key={date}
            type="button"
            aria-pressed={selected}
            aria-label={formatManilaDate(date)}
            onClick={() => onChange(date)}
            className={[
              "flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 text-sm transition-all",
              selected
                ? "border-primary bg-primary text-white shadow-md shadow-primary/15"
                : "border-gray-200 bg-white text-navy hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
              {date === today ? "Today" : weekday}
            </span>
            <span className="text-xl font-extrabold">{Number(day)}</span>
          </button>
        );
      })}
    </div>
  );
}
