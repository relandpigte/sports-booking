import * as z from "zod";
import { SKILL_LEVELS, ROLE_VALUES, MAX_BOOKING_HOURS } from "@/lib/constants";

const skillValues = SKILL_LEVELS.map((s) => s.value) as [string, ...string[]];
const roleValues = [...ROLE_VALUES] as [string, ...string[]];

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Password is required" }),
});

export const RegisterSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { error: "Full name is required" }),
    playerName: z
      .string()
      .trim()
      .min(2, { error: "Player name is required" }),
    email: z.email({ error: "Enter a valid email" }).trim().toLowerCase(),
    phone: z
      .string()
      .trim()
      .min(6, { error: "Telephone number is required" }),
    skillLevel: z.enum(skillValues, { error: "Choose a skill level" }),
    password: z
      .string()
      .min(6, { error: "Password must be at least 6 characters" }),
    confirmPassword: z.string(),
    privateProfile: z.boolean(),
    agreed: z
      .boolean()
      .refine((v) => v, { error: "You must accept the Terms & Privacy Policy" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

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

export const CancelBookingSchema = z.object({
  id: z.string().min(1),
  reason: optionalText,
});

// The partner is declining someone else's reservation, so a reason is required.
export const PartnerCancelBookingSchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, { error: "Give the player a reason" }),
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
  // The venue is moving someone else's reservation, so this is required —
  // same rule as PartnerCancelBookingSchema.
  reason: z.string().trim().min(3, { error: "Give the player a reason" }),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
