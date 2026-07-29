import { formatTime } from "@/lib/hours";
import type { Weekday } from "@/lib/constants";

// All booking date/time reasoning happens in Asia/Manila, regardless of where
// the server runs (it may well be UTC). This module is the ONLY place that
// converts between civil dates and instants — nothing else should call
// getHours()/getDate()/toLocaleDateString() without a timeZone, or parse a
// bare "YYYY-MM-DD" (that parses as UTC midnight, i.e. 8:00 AM in Manila).
//
// The Philippines has had no DST since 1978, so UTC+8 is a safe fixed offset
// for arithmetic; "now" still goes through Intl so reads stay correct if that
// ever changes.
export const MANILA_TZ = "Asia/Manila";

const MS_PER_HOUR = 3_600_000;

// en-CA formats as YYYY-MM-DD, which is also lexicographically sortable.
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: MANILA_TZ,
  hour: "2-digit",
  hourCycle: "h23",
});

// Today's civil date in Manila, e.g. "2026-07-27".
export function manilaToday(): string {
  return dateFmt.format(new Date());
}

// The Manila civil date an instant falls on, e.g. a payment at 23:30 UTC is
// already the NEXT day here. Reporting buckets by this rather than by the raw
// timestamp — otherwise a late-evening payment lands in the wrong day and both
// ends of every month total are wrong.
export function manilaDateOf(instant: Date): string {
  return dateFmt.format(instant);
}

// "2026-07-27" -> "2026-07". The month a civil date belongs to.
export function manilaMonthOf(date: string): string {
  return date.slice(0, 7);
}

// The current hour in Manila, 0..23.
export function manilaNowHour(): number {
  return Number(hourFmt.format(new Date()));
}

// The single date+hour -> instant conversion. `hour` may be 0..24, where 24
// means midnight the following day — hence millisecond arithmetic rather than
// building an invalid "T24:00:00" string.
export function manilaInstant(date: string, hour: number): Date {
  return new Date(Date.parse(`${date}T00:00:00+08:00`) + hour * MS_PER_HOUR);
}

const DOW: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// The weekday key (matching WEEKDAYS in constants) for a Manila civil date.
// Anchored at UTC noon so no offset can push it into a neighbouring day.
export function manilaWeekday(date: string): Weekday {
  return DOW[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

// Shifts a "YYYY-MM-DD" civil date by n days. UTC-noon anchored for the same
// reason as manilaWeekday.
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  // Rejects things like "2026-02-31" that pass the regex but roll over.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// --- Instant arithmetic (billing deadlines) ---------------------------------
// Deliberately named differently from addDays above, which shifts a civil-date
// STRING. These shift a real instant, and confusing the two would be silent.

export function addDaysTo(instant: Date, n: number): Date {
  return new Date(instant.getTime() + n * 24 * MS_PER_HOUR);
}

// Adds calendar months, CLAMPING to the end of the target month:
// Jan 31 + 1 month is Feb 28, not Mar 3. setUTCMonth overflows silently, which
// is the whole reason this helper exists.
export function addMonthsTo(instant: Date, n: number): Date {
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth() + n;
  const day = instant.getUTCDate();

  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const out = new Date(instant.getTime());
  out.setUTCFullYear(year, month, Math.min(day, lastDay));
  return out;
}

// "2026-07-27" -> "Mon, Jul 27"
export function formatManilaDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

// "2026-07-27" -> "Monday, 27 July 2026"
export function formatManilaDateLong(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

// 18 -> "6:00 PM", 24 -> "12:00 AM". Delegates to formatTime, which already
// renders "00:00" as "12:00 AM".
export function formatHourLabel(hour: number): string {
  return formatTime(`${String(hour % 24).padStart(2, "0")}:00`);
}

// (18, 21) -> "6:00 PM – 9:00 PM"
export function formatSlotRange(startHour: number, endHour: number): string {
  return `${formatHourLabel(startHour)} – ${formatHourLabel(endHour)}`;
}
