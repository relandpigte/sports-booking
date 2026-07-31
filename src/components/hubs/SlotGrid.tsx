"use client";

import type { Slot } from "@/lib/slots";

// Hourly slots the player taps to pick their times. Each hour toggles on its
// own — a selection does not have to be one unbroken block.
export function SlotGrid({
  slots,
  selected,
  onToggle,
  loading,
  live,
}: {
  slots: Slot[];
  selected: number[];
  onToggle: (hour: number) => void;
  loading: boolean;
  live: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No time slots available on this date.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        role="group"
        aria-label="Available start times"
      >
        {slots.map((slot) => {
          const isSelected = selected.includes(slot.hour);

          return (
            <button
              key={slot.hour}
              type="button"
              disabled={!slot.available}
              aria-pressed={isSelected}
              onClick={() => onToggle(slot.hour)}
              title={
                slot.reason === "booked"
                  ? "Already booked"
                  : slot.reason === "past"
                    ? "This time has passed"
                    : undefined
              }
              className={[
                "h-12 rounded-xl border-2 text-sm font-bold transition-all",
                isSelected
                  ? "border-primary bg-primary text-white shadow-md shadow-primary/15"
                  : slot.reason === "booked"
                    ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through"
                    : slot.reason === "past"
                      ? "cursor-not-allowed border-gray-100 bg-white text-gray-300"
                      : "border-gray-200 bg-white text-navy hover:border-primary hover:text-primary",
              ].join(" ")}
            >
              {slot.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-gray-300 bg-white" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gray-200" />
          Booked
        </span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-green-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live availability
          </span>
        )}
      </div>
    </div>
  );
}
