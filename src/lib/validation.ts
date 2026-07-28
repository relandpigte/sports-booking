import * as z from "zod";
import {
  SKILL_LEVELS,
  ROLE_VALUES,
  MAX_BOOKING_HOURS,
  PLAN_KEY_VALUES,
  PAYMENT_METHODS,
  VENUE_GATEWAY_VALUES,
} from "@/lib/constants";

const skillValues = SKILL_LEVELS.map((s) => s.value) as [string, ...string[]];
const roleValues = [...ROLE_VALUES] as [string, ...string[]];

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Password is required" }),
});

// Factored out so the partner schema can reshape it. A refined schema (one
// with .refine) can't be .omit()/.extend()-ed, so the base object and the
// cross-field rule have to live separately.
const registerBase = z.object({
  fullName: z.string().trim().min(2, { error: "Full name is required" }),
  playerName: z.string().trim().min(2, { error: "Player name is required" }),
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  phone: z.string().trim().min(6, { error: "Telephone number is required" }),
  skillLevel: z.enum(skillValues, { error: "Choose a skill level" }),
  password: z
    .string()
    .min(6, { error: "Password must be at least 6 characters" }),
  confirmPassword: z.string(),
  privateProfile: z.boolean(),
  agreed: z
    .boolean()
    .refine((v) => v, { error: "You must accept the Terms & Privacy Policy" }),
});

const passwordsMatch = (d: { password: string; confirmPassword: string }) =>
  d.password === d.confirmPassword;
const passwordMismatch = {
  error: "Passwords do not match",
  path: ["confirmPassword"],
};

// Unchanged in shape and behaviour for the existing player form.
export const RegisterSchema = registerBase.refine(
  passwordsMatch,
  passwordMismatch
);

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;

// --- Admin: user management ---

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const AdminCreateUserSchema = z.object({
  name: z.string().trim().min(2, { error: "Name is required" }),
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  role: z.enum(roleValues, { error: "Choose a role" }),
  password: z
    .string()
    .min(6, { error: "Password must be at least 6 characters" }),
  playerName: optionalText,
  phone: optionalText,
  skillLevel: z.enum(skillValues, { error: "Choose a skill level" }),
});

export const AdminUpdateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, { error: "Name is required" }),
  role: z.enum(roleValues, { error: "Choose a role" }),
  playerName: optionalText,
  phone: optionalText,
  skillLevel: z.enum(skillValues, { error: "Choose a skill level" }),
  privateProfile: z.boolean(),
});

export type AdminCreateUserInput = z.infer<typeof AdminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;

// --- Player: own profile (account settings) ---

export const ProfileSchema = z.object({
  name: z.string().trim().min(2, { error: "Name is required" }),
  playerName: optionalText,
  phone: optionalText,
  skillLevel: z.enum(skillValues, { error: "Choose a skill level" }),
  privateProfile: z.boolean(),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

// --- Partner: hub ---

export const HubSchema = z.object({
  name: z.string().trim().min(2, { error: "Hub name is required" }),
  about: optionalText,
  address: optionalText,
  phone: optionalText,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((v) => !v || z.email().safeParse(v).success, {
      error: "Enter a valid email",
    })
    .transform((v) => (v ? v : undefined)),
});

export type HubInput = z.infer<typeof HubSchema>;

// --- Player: bookings ---

export const CreateBookingSchema = z.object({
  courtId: z.string().min(1, { error: "Choose a court" }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date" }),
  // The hours the player tapped, in any combination — they need not be
  // contiguous. The action groups them into runs, one booking each.
  hours: z
    .array(z.coerce.number().int().min(0).max(23))
    .min(1, { error: "Choose at least one hour" })
    // Sanity bound only — see MAX_BOOKING_HOURS. The real limits are the hub's
    // closing time and other bookings, enforced by the availability re-check.
    .max(MAX_BOOKING_HOURS, { error: "That's too many hours to book at once" }),
  notes: optionalText,
});

// The partner is declining someone else's reservation, so a reason is required.
export const PartnerCancelBookingSchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, { error: "Give the player a reason" }),
  // Only meaningful when the booking was paid. .catch so an absent field —
  // an unpaid booking's form doesn't render the choice — means "none".
  refund: z.enum(["full", "none"]).catch("none"),
});

// The venue moving an existing booking to a new court / date / time.
export const RescheduleBookingSchema = z.object({
  id: z.string().min(1),
  courtId: z.string().min(1, { error: "Choose a court" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date" }),
  // Hours need not be contiguous. A Booking is one range, so a gapped
  // selection splits: the original booking takes the first run and the rest
  // become their own bookings, all recording the same move.
  hours: z
    .array(z.coerce.number().int().min(0).max(23))
    .min(1, { error: "Choose at least one hour" })
    .max(MAX_BOOKING_HOURS, { error: "That's too many hours" }),
  // Optional: a venue often just shuffles courts with nothing to explain, and
  // the move is shown to the player either way. Cancelling still requires a
  // reason (PartnerCancelBookingSchema) — losing a booking outright is the
  // case that always needs one.
  reason: optionalText,
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

// --- Partner registration & billing ---

const planKeyValues = [...PLAN_KEY_VALUES] as [string, ...string[]];
const methodValues = PAYMENT_METHODS.map((m) => m.value) as [
  string,
  ...string[],
];

// A venue has no player name, skill level or private-profile setting; it has a
// business name, a plan and a way to pay.
export const PartnerRegisterSchema = registerBase
  .omit({ playerName: true, skillLevel: true, privateProfile: true })
  .extend({
    businessName: z
      .string()
      .trim()
      .min(2, { error: "Business name is required" }),
    planKey: z.enum(planKeyValues, { error: "Choose a plan" }),
    paymentMethod: z.enum(methodValues, { error: "Choose a payment method" }),
  })
  .refine(passwordsMatch, passwordMismatch);

// Card details are their OWN schema, never merged into one whose parsed output
// gets echoed back into a form — a card number must not round-trip through
// form state.
export const CardSchema = z.object({
  cardName: z.string().trim().min(2, { error: "Name on card is required" }),
  cardNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^\d{13,19}$/.test(v), {
      error: "Enter a valid card number",
    }),
  cardExpMonth: z.coerce
    .number()
    .int()
    .min(1, { error: "Invalid month" })
    .max(12, { error: "Invalid month" }),
  cardExpYear: z.coerce
    .number()
    .int()
    .min(new Date().getUTCFullYear(), { error: "That card has expired" }),
  cardCvc: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, { error: "Invalid security code" }),
});

export const ChangePlanSchema = z.object({
  planKey: z.enum(planKeyValues, { error: "Choose a plan" }),
});

export const SetPaymentMethodSchema = z.object({
  method: z.enum(methodValues, { error: "Choose a payment method" }),
});

export type PartnerRegisterInput = z.infer<typeof PartnerRegisterSchema>;

// --- Players paying venues ---

const venueGatewayValues = [...VENUE_GATEWAY_VALUES] as [string, ...string[]];

// Like CardSchema, this schema's output NEVER goes back into form state — a
// partner's secret key must not round-trip through a rendered page.
export const ConnectGatewaySchema = z.object({
  provider: z.enum(venueGatewayValues, { error: "Choose a gateway" }),
  publicKey: z
    .string()
    .trim()
    .min(8, { error: "Paste your publishable key" })
    .max(255),
  secretKey: z
    .string()
    .trim()
    .min(8, { error: "Paste your secret key" })
    .max(255),
  webhookSecret: z
    .string()
    .trim()
    .min(16, { error: "Paste your webhook signing secret" })
    .max(255),
});

export const PayBookingSchema = z.object({
  paymentId: z.string().min(1),
  method: z.enum(["CARD", "GCASH", "MAYA"], { error: "Choose how to pay" }),
});

export const RefundBookingSchema = z.object({
  id: z.string().min(1),
  reason: optionalText,
});
