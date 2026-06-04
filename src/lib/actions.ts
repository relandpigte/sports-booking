"use server";

import * as z from "zod";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { LoginSchema, RegisterSchema } from "@/lib/validation";

export type AuthFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

function firstErrors(error: z.ZodError): Record<string, string> {
  const { fieldErrors } = z.flattenError(error) as {
    fieldErrors: Record<string, string[] | undefined>;
  };
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) out[key] = messages[0];
  }
  return out;
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    playerName: String(formData.get("playerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    privateProfile: formData.get("privateProfile") === "on",
    agreed: formData.get("agreed") === "on",
  };

  // Values echoed back to the form so inputs survive a validation error.
  const values = {
    fullName: raw.fullName,
    playerName: raw.playerName,
    email: raw.email,
    phone: raw.phone,
    skillLevel: raw.skillLevel,
  };

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }

  const data = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    return {
      errors: { email: "An account with this email already exists" },
      values,
    };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  await prisma.user.create({
    data: {
      name: data.fullName,
      playerName: data.playerName,
      email: data.email,
      phone: data.phone,
      skillLevel: data.skillLevel,
      privateProfile: data.privateProfile,
      passwordHash,
    },
  });

  // Sign the new user in. On success this throws a redirect to /dashboard.
  try {
    await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        message:
          "Your account was created, but automatic sign-in failed. Please log in.",
        values,
      };
    }
    throw error;
  }

  return {};
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values: { email: raw.email } };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        message: "Invalid email or password",
        values: { email: raw.email },
      };
    }
    throw error;
  }

  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
