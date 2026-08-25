import * as z from "zod";

import { facebookPageUrl } from "@/lib/social";
import {
  SKILL_LEVELS,
  ROLE_VALUES,
  GAME_VALUES,
  MAX_BOOKING_COURT_HOURS,
  MAX_BOOKING_HOURS,
  VENUE_GATEWAY_VALUES,
} from "@/lib/constants";
import { HUB_SLUG_MAX_LENGTH } from "@/lib/hub-slug";

const skillValues = SKILL_LEVELS.map((s) => s.value) as [string, ...string[]];
const roleValues = [...ROLE_VALUES] as [string, ...string[]];
const gameValues = [...GAME_VALUES] as [string, ...string[]];

export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_BYTES = 64;

const COMMON_PASSWORDS = new Set([
  "123456789012345",
  "adminadminadmin",
  "letmeinletmein",
  "passwordpassword",
  "qwertyqwertyqwerty",
]);

const PasswordSchema = z.string().superRefine((password, context) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    context.addIssue({
      code: "custom",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }
  if (new TextEncoder().encode(password).byteLength > MAX_PASSWORD_BYTES) {
    context.addIssue({
      code: "custom",
      message: `Password must be ${MAX_PASSWORD_BYTES} bytes or fewer`,
    });
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    context.addIssue({
      code: "custom",
      message: "Choose a less common password",
    });
  }
});

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Password is required" }),
});

export const ForgotPasswordSchema = z.object({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
});

export const ResetPasswordSchema = z
  .object({
    token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, { error: "This reset link is invalid" }),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const ChangePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: "Current password is required" }),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const RegisterSchema = z.object({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  password: PasswordSchema,
});

export const GoogleRegistrationSchema = z.object({
  role: z.enum(["PLAYER", "PARTNER"], { error: "Choose an account type" }),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;

// --- Admin: user management ---

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

// A Facebook page in any of the shapes people actually paste, stored as one
// canonical URL. Optional everywhere: a venue without a page is still a venue.
const facebookPage = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? facebookPageUrl(v) : undefined))
  .refine((v) => v !== null, {
    error: "Enter a Facebook page link, or leave it blank",
  })
  .transform((v) => v ?? undefined);

export const AdminCreateUserSchema = z.object({
  name: z.string().trim().min(2, { error: "Name is required" }),
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  role: z.enum(roleValues, { error: "Choose a role" }),
  password: PasswordSchema,
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
  name: optionalText,
  playerName: optionalText,
  phone: optionalText,
  facebookPage,
  skillLevel: z.enum(skillValues, { error: "Choose a skill level" }),
  privateProfile: z.boolean(),
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

// --- Partner: hub ---

export const HubSlugSchema = z
  .string()
  .trim()
  .min(3, { error: "Public URL must be at least 3 characters" })
  .max(HUB_SLUG_MAX_LENGTH, {
    error: `Public URL must be ${HUB_SLUG_MAX_LENGTH} characters or fewer`,
  })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: "Use lowercase letters, numbers, and hyphens only",
  })
  .refine((value) => value !== "new", {
    error: "That public URL is reserved",
  });

export const HubSchema = z.object({
  name: z.string().trim().min(2, { error: "Hub name is required" }),
  slug: HubSlugSchema,
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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date" }),
  // Each item is one court-hour. Players may choose the same hour on several
  // courts; only an exact duplicate court-hour is normalized by the action.
  selections: z
    .array(
      z.object({
        courtId: z.string().min(1, { error: "Choose a court" }),
        hour: z.coerce.number().int().min(0).max(23),
      })
    )
    .min(1, { error: "Choose at least one court and hour" })
    // Sanity bound only — see MAX_BOOKING_COURT_HOURS. The real limits are the
    // hub's schedule and other bookings, enforced by the availability re-check.
    .max(MAX_BOOKING_COURT_HOURS, {
      error: "That's too many court-hours to book at once",
    }),
  notes: optionalText,
});

export const GuestBookingContactSchema = z.object({
  guestName: z
    .string()
    .trim()
    .min(2, { error: "Enter your full name" })
    .max(100, { error: "Name must be 100 characters or fewer" }),
  guestPhone: z
    .string()
    .trim()
    .min(7, { error: "Enter a valid phone number" })
    .max(30, { error: "Phone number must be 30 characters or fewer" }),
  guestEmail: z
    .email({ error: "Enter a valid email address" })
    .trim()
    .toLowerCase(),
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

// --- Partner application ---

// Partner account creation is intentionally minimal. These owner and venue
// fields are collected after sign-in when the draft is submitted for review.
export const PartnerApplicationSchema = z.object({
  fullName: z.string().trim().min(2, { error: "Full name is required" }),
  phone: z.string().trim().min(6, { error: "Telephone number is required" }),
  hubName: z.string().trim().min(2, { error: "Hub name is required" }),
  slug: HubSlugSchema,
  hubAbout: optionalText,
  hubPhone: optionalText,
  hubEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((value) => !value || z.email().safeParse(value).success, {
      error: "Enter a valid hub email",
    })
    .transform((value) => (value ? value : undefined)),
  address: z
    .string()
    .trim()
    .min(5, { error: "Complete address is required" }),
  games: z
    .array(z.enum(gameValues))
    .min(1, { error: "Choose at least one sport" }),
  facebookPage,
});

export type PartnerApplicationInput = z.infer<
  typeof PartnerApplicationSchema
>;

// --- Players paying venues ---

const venueGatewayValues = [...VENUE_GATEWAY_VALUES] as [string, ...string[]];

// This schema's output never goes back into form state; a partner's secret key
// must not round-trip through a rendered page.
export const ConnectGatewaySchema = z.object({
  provider: z.enum(venueGatewayValues, { error: "Choose a gateway" }),
  publicKey: z
    .string()
    .trim()
    .min(8, { error: "Paste your publishable key" })
    .max(255)
    .refine((v) => v.startsWith("pk_"), {
      error: "A publishable key starts with pk_",
    }),
  secretKey: z
    .string()
    .trim()
    .min(8, { error: "Paste your secret key" })
    .max(255)
    .refine((v) => v.startsWith("sk_"), {
      error: "A secret key starts with sk_",
    }),
  // Optional: we register the webhook in the partner's own account and keep
  // the secret PayMongo hands back. This is the escape hatch for when that
  // fails — an existing endpoint whose secret can't be read a second time, or
  // an account at its webhook limit.
  webhookSecret: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v == null || v.length >= 16, {
      error: "That signing secret looks too short",
    }),
});

// The platform account only needs a secret key: Bunal.club creates server-side
// hosted checkouts and never exposes a PayMongo SDK in the browser.
export const ConnectPlatformGatewaySchema = z.object({
  secretKey: z
    .string()
    .trim()
    .min(8, { error: "Paste your PayMongo secret key" })
    .max(255)
    .refine((v) => /^sk_(test|live)_/.test(v), {
      error: "Use a PayMongo secret key starting with sk_test_ or sk_live_",
    }),
  webhookSecret: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v == null || v.length >= 16, {
      error: "That signing secret looks too short",
    }),
});

// Just the payment: PayMongo's own page collects the method and the card.
export const PayBookingSchema = z.object({
  paymentId: z.string().min(1),
});

export const RefundBookingSchema = z.object({
  id: z.string().min(1),
  reason: optionalText,
});
