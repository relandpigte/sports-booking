import type {
  BookingStatus,
  PaymentStatus,
  Role,
  SubscriptionStatus,
} from "@prisma/client";

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
  { value: "basketball", label: "Basketball" },
  { value: "squash", label: "Squash" },
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

// Bunal.ph's cut, added ON TOP of the venue's rate: a ₱500 booking is shown to
// the player as ₱525, and the venue still receives their full ₱500. Joining is
// free, so this is the platform's only revenue.
export const PLATFORM_FEE_RATE = 0.05;

// The fee on a court total, to the centavo.
//
// Every surface computes it through here — the booking grid, the pay page, the
// ledger and the monthly invoice — because a fee the player was quoted and a
// fee the venue is billed for must be the same number, and floating-point
// pesos are exactly where that goes wrong. Rounded HALF UP on the centavo,
// which is what a Philippine invoice does.
export function platformFeeFor(courtTotal: number): number {
  return Math.round(courtTotal * PLATFORM_FEE_RATE * 100) / 100;
}

// What the player pays: court time plus the fee.
export function grossFor(courtTotal: number): number {
  return Math.round((courtTotal + platformFeeFor(courtTotal)) * 100) / 100;
}

// A booking is paid once, so these carry none of the auto-renew hints that the
// subscription methods do — those would be wrong here.
export const BOOKING_PAYMENT_METHODS = [
  { value: "CARD", label: "Credit or debit card" },
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
] as const;

// The only gateway a partner can connect. There is no simulated option any
// more: a payment either moves real money or fails honestly.
export const VENUE_GATEWAYS = [
  {
    value: "paymongo",
    label: "PayMongo",
    hint: "Cards, GCash and Maya. Players pay on PayMongo's secure page and the money lands in your account.",
  },
] as const;

export const VENUE_GATEWAY_VALUES = ["paymongo"] as const;

// --- Billing ----------------------------------------------------------------

// Free trial for a brand-new partner. No charge is taken at registration.
// Every piece of copy reads this, so changing it here changes the product.
export const TRIAL_DAYS = 7;

// After a payment is missed, access survives this long before it's restricted.
export const GRACE_DAYS = 7;

// Card dunning: how long between automatic retries, and how many to attempt
// before falling back to "Pay now" only.
export const RENEWAL_RETRY_DAYS = 3;
export const MAX_RENEWAL_ATTEMPTS = 3;

// Show the billing banner this many days before a renewal or trial end.
export const BILLING_NOTICE_DAYS = 3;

export const PLAN_KEY_VALUES = ["STARTER", "PRO", "ELITE"] as const;

// How the partner INTENDS to pay each month. Nothing renews automatically:
// PayMongo can't auto-debit a saved card outside its Subscriptions API, so
// every month is paid by opening a link. The hints say so out loud rather than
// promising a convenience the product can't deliver.
export const PAYMENT_METHODS = [
  {
    value: "CARD",
    label: "Credit or debit card",
    hint: "We'll send you a secure link each month — nothing is charged without you.",
  },
  {
    value: "GCASH",
    label: "GCash",
    hint: "We'll remind you to pay each month. Your wallet is never charged automatically.",
  },
  {
    value: "MAYA",
    label: "Maya",
    hint: "We'll remind you to pay each month. Your wallet is never charged automatically.",
  },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label])
);

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment due",
  UNPAID: "Unpaid",
  CANCELLED: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  SUCCEEDED: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};
