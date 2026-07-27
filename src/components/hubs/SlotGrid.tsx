"use client";

import type { HourRange, Slot } from "@/lib/slots";

// Hourly slots the player taps to build a contiguous session. Tapping an hour
// adds it, extends the run, or removes it — see toggleHour in lib/slots.
export function SlotGrid({
  slots,
  range,
  onToggle,
  loading,
  live,
}: {
  slots: Slot[];
  range: HourRange | null;
  onToggle: (hour: number) => void;
  loading: boolean;
  live: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
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
          const selected =
            range != null && slot.hour >= range.start && slot.hour <= range.end;
          // The two hours that extend or trim the run get a ring, so it's
          // obvious where the next tap acts.
          const isEdge =
            selected && (slot.hour === range.start || slot.hour === range.end);

          return (
            <button
              key={slot.hour}
              type="button"
              disabled={!slot.available}
              aria-pressed={selected}
              onClick={() => onToggle(slot.hour)}
              title={
                slot.reason === "booked"
                  ? "Already booked"
                  : slot.reason === "past"
                    ? "This time has passed"
                    : undefined
              }
              className={[
                "h-11 rounded-lg border text-sm font-medium transition-colors",
                selected
                  ? "border-primary bg-primary text-white"
                  : slot.reason === "booked"
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through"
                    : slot.reason === "past"
                      ? "cursor-not-allowed border-gray-200 bg-white text-gray-300"
                      : "border-gray-300 bg-white text-gray-700 hover:border-primary hover:text-primary",
                isEdge ? "ring-2 ring-primary/30" : "",
              ].join(" ")}
            >
              {slot.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
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
