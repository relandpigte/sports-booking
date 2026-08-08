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

export const HUB_BOOKING_STATUS_VALUES = [
  "OPEN",
  "COMING_SOON",
  "MAINTENANCE",
] as const;

export type HubBookingStatusValue =
  (typeof HUB_BOOKING_STATUS_VALUES)[number];

export const HUB_BOOKING_STATUS_OPTIONS: Array<{
  value: HubBookingStatusValue;
  label: string;
  description: string;
}> = [
  {
    value: "OPEN",
    label: "Accepting bookings",
    description: "Players can reserve courts and join events.",
  },
  {
    value: "COMING_SOON",
    label: "Coming soon",
    description: "Show the venue publicly, but keep all bookings closed.",
  },
  {
    value: "MAINTENANCE",
    label: "Under maintenance",
    description: "Temporarily pause all new court and event bookings.",
  },
];

// --- Bookings ---------------------------------------------------------------

// Players choose their own duration by tapping contiguous hours on the grid —
// there is no product limit on length. This is only a sanity bound so a
// hand-crafted request can't claim an absurd number of hours; a real booking
// is capped anyway by the hub's closing time and by other players' bookings.
export const MAX_BOOKING_HOURS = 24;

// Multi-court carts count court-hours rather than clock hours. This remains a
// request-abuse ceiling, not a product restriction: 240 covers ten full-day
// courts in one atomic checkout.
export const MAX_BOOKING_COURT_HOURS = 240;

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

// How long an unpaid court booking or event registration reserves capacity
// before it goes back on sale.
export const BOOKING_HOLD_MINUTES = 15;

// A player who reaches PayMongo before the hold expires gets a short window
// to finish QR Ph authorization. This is applied only after the checkout
// session is claimed and never shortens the main hold.
export const PAYMENT_COMPLETION_GRACE_MINUTES = 5;

// PayMongo's published QR Ph rate is 1.34% before 12% VAT. Direct Payment
// Intents do not support Checkout V2's pass_on_fees flag, so the charge is
// grossed up to leave the booking subtotal after PayMongo deducts this rate.
// Deployments with negotiated merchant pricing can override the VAT-inclusive
// decimal rate (for example, 0.015008) without rewriting historical payments.
export const DEFAULT_PAYMONGO_QRPH_PROCESSING_RATE = 0.0134 * 1.12;

export function paymongoQrPhProcessingRate(): number {
  const configured = Number(process.env.PAYMONGO_QRPH_PROCESSING_RATE);
  return Number.isFinite(configured) && configured > 0 && configured < 1
    ? configured
    : DEFAULT_PAYMONGO_QRPH_PROCESSING_RATE;
}

export function paymongoQrPhProcessingFeeFor(subtotal: number): number {
  const subtotalCentavos = Math.round(subtotal * 100);
  if (subtotalCentavos <= 0) return 0;

  const chargeCentavos = Math.round(
    subtotalCentavos / (1 - paymongoQrPhProcessingRate())
  );
  return (chargeCentavos - subtotalCentavos) / 100;
}

export function paymongoQrPhTotalFor(subtotal: number): number {
  const subtotalCentavos = Math.round(subtotal * 100);
  const feeCentavos = Math.round(
    paymongoQrPhProcessingFeeFor(subtotal) * 100
  );
  return (subtotalCentavos + feeCentavos) / 100;
}

// Bunal.club's percentage fee, added ON TOP of the venue's court total. It is
// charged once per checkout even when gaps split the selected hours into
// separate Booking rows. Joining is free.
export const SERVICE_FEE_RATE = 0.03;
export const SERVICE_FEE_PERCENT = SERVICE_FEE_RATE * 100;
export const MANUAL_SERVICE_FEE_RATE = 0.025;
export const MANUAL_SERVICE_FEE_PERCENT = MANUAL_SERVICE_FEE_RATE * 100;

// Every surface computes the fee through here so the quote and payment ledger
// agree. Money is rounded once to centavos at the quote boundary.
export function bookingServiceFeeFor(courtTotal: number): number {
  if (courtTotal <= 0) return 0;
  const courtCentavos = Math.round(courtTotal * 100);
  return Math.round(courtCentavos * SERVICE_FEE_RATE) / 100;
}

// Manual transfers avoid PayMongo processing but still carry Bunal.club's
// lower platform fee. Keep this separate from the automatic rate so each
// payment snapshots the policy selected when its checkout was created.
export function manualBookingServiceFeeFor(courtTotal: number): number {
  if (courtTotal <= 0) return 0;
  const courtCentavos = Math.round(courtTotal * 100);
  return Math.round(courtCentavos * MANUAL_SERVICE_FEE_RATE) / 100;
}

// The booking subtotal before PayMongo's separately snapshotted processing fee.
export function grossFor(courtTotal: number): number {
  const courtCentavos = Math.round(courtTotal * 100);
  const feeCentavos = Math.round(bookingServiceFeeFor(courtTotal) * 100);
  return (courtCentavos + feeCentavos) / 100;
}

export function manualGrossFor(courtTotal: number): number {
  const courtCentavos = Math.round(courtTotal * 100);
  const feeCentavos = Math.round(manualBookingServiceFeeFor(courtTotal) * 100);
  return (courtCentavos + feeCentavos) / 100;
}

// The only gateway a partner can connect. There is no simulated option any
// more: a payment either moves real money or fails honestly.
export const VENUE_GATEWAYS = [
  {
    value: "paymongo",
    label: "PayMongo",
    hint: "QR Ph payments. Booking subtotals land in your account; remit Bunal.club service fees from Payments.",
  },
] as const;

export const VENUE_GATEWAY_VALUES = ["paymongo"] as const;
