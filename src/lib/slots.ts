import type { DayHours, OperatingHours } from "@/lib/constants";
import { formatHourLabel, manilaWeekday } from "@/lib/time";

// Pure slot math, shared by the hub page, the booking action, the SSE route and
// the client grid. Because it's shared, the realtime payload only has to carry
// `bookedHours: number[]` — the client recomputes the same grid the server did.

export type SlotReason = "booked" | "past";

export type Slot = {
  hour: number;
  label: string;
  available: boolean;
  reason?: SlotReason;
};

/**
 * Turns a day's operating hours into a bookable [start, end) window in Manila
 * hours.
 *
 * GOTCHA: a close of "00:00" means MIDNIGHT THE NEXT DAY, i.e. 24 — not 0. The
 * default hub hours are 06:00–00:00, so reading it as 0 yields zero bookable
 * slots for essentially every hub in the database.
 *
 * Closed days submit empty strings for open/close. Minutes are floored: we
 * only sell whole hours, so a 22:30 close becomes 22.
 */
export function dayWindow(
  day: DayHours | undefined
): { start: number; end: number } | null {
  if (!day || day.closed) return null;
  if (!day.open || !day.close) return null;

  const start = Number(day.open.slice(0, 2));
  const rawClose = Number(day.close.slice(0, 2));
  if (!Number.isInteger(start) || !Number.isInteger(rawClose)) return null;
  if (start < 0 || start > 23) return null;

  // "00:00" -> 24. Any other close at or before open (e.g. 06:00–02:00) is an
  // overnight schedule; we clamp to 24 because hours past midnight belong to
  // the next civil date and are sold there.
  const end = rawClose === 0 ? 24 : rawClose <= start ? 24 : rawClose;
  if (end <= start) return null;

  return { start, end };
}

export type BuildSlotsInput = {
  operatingHours: OperatingHours | null;
  date: string; // "YYYY-MM-DD" Manila
  bookedHours: number[];
  today: string; // manilaToday()
  nowHour: number; // manilaNowHour()
};

export function buildSlots(input: BuildSlotsInput): {
  closed: boolean;
  slots: Slot[];
} {
  const window = input.operatingHours
    ? dayWindow(input.operatingHours[manilaWeekday(input.date)])
    : null;
  if (!window) return { closed: true, slots: [] };

  const booked = new Set(input.bookedHours);
  // ISO dates sort lexicographically, so a string compare is a valid past check.
  const isPastDate = input.date < input.today;
  const isToday = input.date === input.today;

  const slots: Slot[] = [];
  for (let hour = window.start; hour < window.end; hour++) {
    // An hour that has already started is no longer bookable.
    const past = isPastDate || (isToday && hour <= input.nowHour);
    const isBooked = booked.has(hour);
    slots.push({
      hour,
      label: formatHourLabel(hour),
      available: !past && !isBooked,
      reason: past ? "past" : isBooked ? "booked" : undefined,
    });
  }
  return { closed: false, slots };
}

// Whether a start hour + duration is a fully available contiguous run.
export function canBook(
  slots: Slot[],
  startHour: number,
  hours: number
): boolean {
  if (hours < 1) return false;
  for (let h = startHour; h < startHour + hours; h++) {
    const slot = slots.find((s) => s.hour === h);
    if (!slot || !slot.available) return false;
  }
  return true;
}

// How many contiguous available hours run from startHour, capped.
export function maxDurationFrom(
  slots: Slot[],
  startHour: number,
  cap: number
): number {
  let n = 0;
  while (n < cap && canBook(slots, startHour, n + 1)) n++;
  return n;
}
