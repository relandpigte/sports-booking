import type { DayHours, OperatingHours } from "@/lib/constants";
import { formatSlotRange, manilaWeekday } from "@/lib/time";

// Pure slot math, shared by the hub page, the booking action, the SSE route and
// the client grid. Because it's shared, the realtime payload only has to carry
// `bookedHours: number[]` — the client recomputes the same grid the server did.

export type SlotReason = "booked" | "closed" | "past";

export type CourtScheduleRule = {
  weekday: number;
  hour: number;
  closed: boolean;
  closureReason?: string | null;
  hourlyRate: number | null;
};

export type Slot = {
  hour: number;
  label: string;
  available: boolean;
  hourlyRate: number | null;
  closureReason: string | null;
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
  courtHourlyRate?: number | null;
  scheduleRules?: CourtScheduleRule[];
};

export const WEEKDAY_INDEX = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
} as const;

export function weekdayIndexForDate(date: string): number {
  return WEEKDAY_INDEX[manilaWeekday(date)];
}

export function buildSlots(input: BuildSlotsInput): {
  closed: boolean;
  slots: Slot[];
} {
  const weekday = manilaWeekday(input.date);
  const window = input.operatingHours
    ? dayWindow(input.operatingHours[weekday])
    : null;
  if (!window) return { closed: true, slots: [] };

  const booked = new Set(input.bookedHours);
  // ISO dates sort lexicographically, so a string compare is a valid past check.
  const isPastDate = input.date < input.today;
  const isToday = input.date === input.today;
  const rules = new Map(
    (input.scheduleRules ?? [])
      .filter((rule) => rule.weekday === WEEKDAY_INDEX[weekday])
      .map((rule) => [rule.hour, rule] as const)
  );

  const slots: Slot[] = [];
  for (let hour = window.start; hour < window.end; hour++) {
    // An hour that has already started is no longer bookable.
    const past = isPastDate || (isToday && hour <= input.nowHour);
    const isBooked = booked.has(hour);
    const rule = rules.get(hour);
    const isClosed = rule?.closed === true;
    slots.push({
      hour,
      label: formatSlotRange(hour, hour + 1),
      available: !past && !isBooked && !isClosed,
      hourlyRate: rule?.hourlyRate ?? input.courtHourlyRate ?? null,
      closureReason: isClosed ? rule?.closureReason?.trim() || null : null,
      reason: past
        ? "past"
        : isBooked
          ? "booked"
          : isClosed
            ? "closed"
            : undefined,
    });
  }
  return { closed: false, slots };
}

// The exact court subtotal for a set of hours. A null rate anywhere keeps the
// existing "rate on request" behaviour rather than silently treating it as ₱0.
export function slotTotal(slots: Slot[], hours: number[]): number | null {
  let centavos = 0;
  for (const hour of hours) {
    const slot = slots.find((item) => item.hour === hour);
    if (!slot || slot.hourlyRate == null) return null;
    centavos += Math.round(slot.hourlyRate * 100);
  }
  return centavos / 100;
}

// Booking.hourlyRate remains a useful snapshot when every selected hour costs
// the same. Mixed-rate bookings store null there and keep the exact sum in
// Booking.totalPrice.
export function uniformSlotRate(
  slots: Slot[],
  hours: number[]
): number | null {
  if (hours.length === 0) return null;
  const rates = hours.map(
    (hour) => slots.find((item) => item.hour === hour)?.hourlyRate ?? null
  );
  if (rates.some((rate) => rate == null)) return null;
  const first = rates[0];
  return rates.every((rate) => rate === first) ? first : null;
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
