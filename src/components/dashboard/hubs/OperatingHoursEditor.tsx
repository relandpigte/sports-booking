"use client";

import { useState } from "react";
import {
  WEEKDAYS,
  type OperatingHours,
  type Weekday,
  type DayHours,
} from "@/lib/constants";

// Default: open 6:00 AM to 12:00 AM (midnight).
const defaultDay = (): DayHours => ({ closed: false, open: "06:00", close: "00:00" });

function buildInitial(initial?: OperatingHours | null): OperatingHours {
  const out = {} as OperatingHours;
  for (const { value } of WEEKDAYS) {
    const d = value as Weekday;
    out[d] = initial?.[d] ?? defaultDay();
  }
  return out;
}

export function OperatingHoursEditor({
  defaultValue,
}: {
  defaultValue?: OperatingHours | null;
}) {
  const [hours, setHours] = useState<OperatingHours>(() =>
    buildInitial(defaultValue)
  );

  function update(day: Weekday, patch: Partial<DayHours>) {
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-800">Operating Hours</span>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {WEEKDAYS.map(({ value, label }) => {
          const d = value as Weekday;
          const day = hours[d];
          return (
            <div
              key={d}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5"
            >
              <span className="w-24 text-sm font-medium text-gray-700">
                {label}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input
                  type="checkbox"
                  name={`day_${d}_closed`}
                  checked={day.closed}
                  onChange={(e) => update(d, { closed: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 accent-[var(--color-primary)]"
                />
                Closed
              </label>
              {!day.closed && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    name={`day_${d}_open`}
                    value={day.open}
                    onChange={(e) => update(d, { open: e.target.value })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    name={`day_${d}_close`}
                    value={day.close}
                    onChange={(e) => update(d, { close: e.target.value })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
