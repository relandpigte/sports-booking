import * as z from "zod";
import { SKILL_LEVELS } from "@/lib/constants";

const skillValues = SKILL_LEVELS.map((s) => s.value) as [string, ...string[]];

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
