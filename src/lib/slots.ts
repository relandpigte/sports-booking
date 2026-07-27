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

export function isAvailable(slots: Slot[], hour: number): boolean {
  return slots.some((s) => s.hour === hour && s.available);
}

// Whether a start hour + duration is a fully available contiguous run.
export function canBook(
  slots: Slot[],
  startHour: number,
  hours: number
): boolean {
  if (hours < 1) return false;
  for (let h = startHour; h < startHour + hours; h++) {
    if (!isAvailable(slots, h)) return false;
  }
  return true;
}

// An inclusive run of back-to-back hours. A selection can contain several —
// a player might want 9 AM and then 6–8 PM on the same day.
export type Run = { start: number; end: number };

export function runHours(run: Run): number {
  return run.end - run.start + 1;
}

// Adds or removes a single hour. Hours are independent: the selection does not
// have to be contiguous, so a tap only ever affects the hour tapped.
export function toggleHourIn(selected: number[], hour: number): number[] {
  return selected.includes(hour)
    ? selected.filter((h) => h !== hour)
    : [...selected, hour].sort((a, b) => a - b);
}

// Drops hours that are no longer bookable — someone else may have taken one
// since it was selected. The rest of the selection survives.
export function clampSelection(slots: Slot[], selected: number[]): number[] {
  return selected.filter((hour) => isAvailable(slots, hour));
}

/**
 * Contiguous variant of toggleHourIn, for the reschedule picker.
 *
 * Rescheduling MOVES one booking, and a Booking is a single range, so the
 * selection has to stay one unbroken block:
 *
 * - nothing selected, or a tap away from the run -> start a new run there
 * - a tap directly before/after the run          -> extend it
 * - a tap on the only selected hour              -> clear
 * - a tap on either end                          -> shrink from that end
 * - a tap inside the run                         -> end the run there
 *
 * The create flow keeps toggleHourIn, where hours are independent — the two
 * pickers differ on purpose.
 */
export function toggleContiguousHour(
  selected: number[],
  hour: number
): number[] {
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  if (selected.length === 0) return [hour];
  const start = selected[0];
  const end = selected[selected.length - 1];

  if (hour < start - 1 || hour > end + 1) return [hour];
  if (hour === start - 1) return range(hour, end);
  if (hour === end + 1) return range(start, hour);

  // Inside the run, so this tap is a deselect.
  if (start === end) return [];
  if (hour === start) return range(start + 1, end);
  if (hour === end) return range(start, end - 1);
  return range(start, hour);
}

// Contiguous variant of clampSelection: keeps the longest unbroken run from
// the start that is still available, so an hour taken mid-edit shortens the
// selection instead of punching a hole in it.
export function clampContiguous(slots: Slot[], selected: number[]): number[] {
  if (selected.length === 0) return [];
  const start = selected[0];
  if (!isAvailable(slots, start)) return [];
  const out = [start];
  for (const hour of selected.slice(1)) {
    if (hour !== out[out.length - 1] + 1 || !isAvailable(slots, hour)) break;
    out.push(hour);
  }
  return out;
}

// Groups selected hours into contiguous runs, each of which becomes its own
// booking: [9, 18, 19, 20] -> [{9,9}, {18,20}].
export function toRuns(selected: number[]): Run[] {
  const sorted = [...new Set(selected)].sort((a, b) => a - b);
  const runs: Run[] = [];
  for (const hour of sorted) {
    const last = runs[runs.length - 1];
    if (last && hour === last.end + 1) last.end = hour;
    else runs.push({ start: hour, end: hour });
  }
  return runs;
}
