import type { BookingStatus, Role } from "@prisma/client";

import type { BadgeTone } from "@/components/ui/Badge";

export const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number]["value"];

export const DEFAULT_SKILL_LEVEL: SkillLevel = "intermediate";

// The User.role enum values.
export const ROLE_VALUES = ["ADMIN", "PLAYER", "PARTNER"] as const;

// Human-readable labels for the User.role enum (ADMIN | PLAYER | PARTNER).
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PLAYER: "Player",
  PARTNER: "Partner",
};

// Options for role <select> inputs.
export const ROLE_OPTIONS = ROLE_VALUES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

// Days of the week, used for hub operating hours.
export const WEEKDAYS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["value"];

export type DayHours = { closed: boolean; open: string; close: string };
export type OperatingHours = Record<Weekday, DayHours>;

// Court games a hub can offer (used to categorize hubs in the directory).
export const GAMES = [
  { value: "pickleball", label: "Pickleball" },
  { value: "tennis", label: "Tennis" },
  { value: "badminton", label: "Badminton" },
  { value: "volleyball", label: "Volleyball" },
] as const;

export type Game = (typeof GAMES)[number]["value"];

export const GAME_VALUES = GAMES.map((g) => g.value);

export const GAME_LABELS: Record<string, string> = Object.fromEntries(
  GAMES.map((g) => [g.value, g.label])
);

// Court types — pricing typically differs between covered and open courts.
export const COURT_TYPES = [
  { value: "covered", label: "Covered" },
  { value: "open", label: "Open" },
] as const;

export type CourtType = (typeof COURT_TYPES)[number]["value"];

export const COURT_TYPE_VALUES = COURT_TYPES.map((c) => c.value);

export const COURT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  COURT_TYPES.map((c) => [c.value, c.label])
);

// --- Bookings ---------------------------------------------------------------

// Players choose their own duration by tapping contiguous hours on the grid —
// there is no product limit on length. This is only a sanity bound so a
// hand-crafted request can't claim an absurd number of hours; a real booking
// is capped anyway by the hub's closing time and by other players' bookings.
export const MAX_BOOKING_HOURS = 24;

// How far ahead players can book.
export const BOOKING_WINDOW_DAYS = 30;

// Exhaustive on purpose: adding a BookingStatus value breaks the build until
// every renderer has been updated.
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

// EXPIRED is neutral, not red: nothing went wrong and nobody was charged — the
// player simply didn't finish paying. Red is reserved for a booking the venue
// took away.
export const BOOKING_STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  PENDING: "warn",
  CONFIRMED: "primary",
  CANCELLED: "danger",
  EXPIRED: "neutral",
};

// --- Reports ----------------------------------------------------------------

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// --- Players paying venues --------------------------------------------------

// How long an unpaid booking holds its hours before they go back on the grid.
export const BOOKING_HOLD_MINUTES = 15;

// Bunal.club's percentage fee, added ON TOP of the venue's court total. It is
// charged once per checkout even when gaps split the selected hours into
// separate Booking rows. Joining is free.
export const SERVICE_FEE_RATE = 0.03;
export const SERVICE_FEE_PERCENT = SERVICE_FEE_RATE * 100;

// Every surface computes the fee through here so the quote and payment ledger
// agree. Money is rounded once to centavos at the quote boundary.
export function bookingServiceFeeFor(courtTotal: number): number {
  if (courtTotal <= 0) return 0;
  const courtCentavos = Math.round(courtTotal * 100);
  return Math.round(courtCentavos * SERVICE_FEE_RATE) / 100;
}

// The booking subtotal. PayMongo may add its processing fee at hosted checkout.
export function grossFor(courtTotal: number): number {
  const courtCentavos = Math.round(courtTotal * 100);
  const feeCentavos = Math.round(bookingServiceFeeFor(courtTotal) * 100);
  return (courtCentavos + feeCentavos) / 100;
}

// The only gateway a partner can connect. There is no simulated option any
// more: a payment either moves real money or fails honestly.
export const VENUE_GATEWAYS = [
  {
    value: "paymongo",
    label: "PayMongo",
    hint: "QR Ph, cards, GCash and Maya. Booking subtotals land in your account; remit Bunal.club service fees from Payments.",
  },
] as const;

export const VENUE_GATEWAY_VALUES = ["paymongo"] as const;
