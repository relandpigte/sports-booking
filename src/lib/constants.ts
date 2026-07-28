import type {
  BookingStatus,
  PaymentStatus,
  Role,
  SubscriptionStatus,
} from "@prisma/client";

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

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

// --- Billing ----------------------------------------------------------------

// Free trial for a brand-new partner. No charge is taken at registration.
export const TRIAL_DAYS = 14;

// After a payment is missed, access survives this long before it's restricted.
export const GRACE_DAYS = 7;

// Card dunning: how long between automatic retries, and how many to attempt
// before falling back to "Pay now" only.
export const RENEWAL_RETRY_DAYS = 3;
export const MAX_RENEWAL_ATTEMPTS = 3;

// Show the billing banner this many days before a renewal or trial end.
export const BILLING_NOTICE_DAYS = 3;

export const PLAN_KEY_VALUES = ["STARTER", "PRO", "ELITE"] as const;

// Only CARD auto-renews. The e-wallet hints below are shown to the partner
// verbatim, because "we will never charge this automatically" is a promise the
// product has to make out loud.
export const PAYMENT_METHODS = [
  {
    value: "CARD",
    label: "Credit or debit card",
    hint: "Renews automatically each month. Cancel any time.",
  },
  {
    value: "GCASH",
    label: "GCash",
    hint: "We never charge your e-wallet automatically — we'll remind you to pay each month.",
  },
  {
    value: "MAYA",
    label: "Maya",
    hint: "We never charge your e-wallet automatically — we'll remind you to pay each month.",
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
