import * as z from "zod";

import { GAME_VALUES } from "@/lib/constants";
import { facebookPageUrl } from "@/lib/social";
import { isValidDateString } from "@/lib/time";

const gameValues = [...GAME_VALUES] as [string, ...string[]];

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: "Username must be at least 3 characters" })
  .max(40, { error: "Username must be 40 characters or fewer" })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: "Use lowercase letters, numbers, and single hyphens",
  })
  .refine((value) => !["new", "admin", "trainers", "dashboard"].includes(value), {
    error: "That username is reserved",
  });

const hour = z.coerce.number().int().min(0).max(24);

export const TrainerProfileSchema = z.object({
  username: UsernameSchema,
  bio: z.string().trim().min(40, { error: "Tell players a little more about your coaching" }).max(2000),
  sports: z.array(z.enum(gameValues)).min(1, { error: "Choose at least one sport" }),
  specialties: z
    .array(z.string().trim().min(2).max(60))
    .min(1, { error: "Add at least one specialty" })
    .max(8),
  experience: z.string().trim().min(20, { error: "Describe your training experience" }).max(2000),
  certifications: z.string().trim().max(2000).optional().transform((value) => value || undefined),
  area: z.string().trim().min(2, { error: "Add a general area" }).max(120),
  locationDetails: z.string().trim().min(5, { error: "Add private meeting instructions" }).max(1000),
  hourlyRate: z.coerce.number().min(1, { error: "Hourly rate must be at least ₱1" }).max(100000),
  facebookPage: z
    .string()
    .trim()
    .min(1, { error: "Facebook Page is required" })
    .transform((value) => facebookPageUrl(value))
    .refine((value) => value != null, { error: "Enter a valid Facebook Page" })
    .transform((value) => value as string),
});

export const TrainerWeeklyRuleSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startHour: hour,
    endHour: hour,
  })
  .refine((value) => value.startHour < value.endHour, {
    error: "Closing time must be after opening time",
    path: ["endHour"],
  });

export const TrainerExceptionSchema = z
  .object({
    date: z.string().refine(isValidDateString, { error: "Choose a valid date" }),
    startHour: hour,
    endHour: hour,
    type: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    note: z.string().trim().max(200).optional().transform((value) => value || undefined),
  })
  .refine((value) => value.startHour < value.endHour, {
    error: "End time must be after start time",
    path: ["endHour"],
  });

export const TrainerRequestSchema = z
  .object({
    trainerProfileId: z.string().min(1),
    date: z.string().refine(isValidDateString, { error: "Choose a valid date" }),
    startHour: hour,
    endHour: hour,
    notes: z.string().trim().min(3, { error: "Add a short note about the session" }).max(2000),
  })
  .refine((value) => value.startHour < value.endHour, {
    error: "Choose at least one hour",
    path: ["endHour"],
  });

export const TrainerDecisionSchema = z.object({
  sessionId: z.string().min(1),
  decision: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().trim().max(1000).optional().transform((value) => value || undefined),
}).superRefine((value, context) => {
  if (value.decision === "DECLINE" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Tell the player why you are declining" });
  }
});

export const TrainerRescheduleSchema = z
  .object({
    sessionId: z.string().min(1),
    date: z.string().refine(isValidDateString, { error: "Choose a valid date" }),
    startHour: hour,
    reason: z.string().trim().min(3, { error: "Tell the player why the session is moving" }).max(1000),
  });

export const TrainerCancelSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().trim().min(3, { error: "Add a cancellation reason" }).max(1000),
});

export const TrainerAdminDecisionSchema = z.object({
  trainerProfileId: z.string().min(1),
  action: z.enum(["APPROVE", "DEACTIVATE"]),
  reason: z.string().trim().max(1000).optional().transform((value) => value || undefined),
}).superRefine((value, context) => {
  if (value.action === "DEACTIVATE" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Add a reason" });
  }
});
