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
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
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
              "flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-sm transition-colors",
              selected
                ? "border-primary bg-primary text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            <span className="text-[11px] uppercase opacity-80">
              {date === today ? "Today" : weekday}
            </span>
            <span className="text-base font-semibold">{Number(day)}</span>
          </button>
        );
      })}
    </div>
  );
}
