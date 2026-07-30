"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { verifySession } from "@/lib/dal";
import { normalizeAvatar } from "@/lib/avatar";
import {
  LoginSchema,
  RegisterSchema,
  ProfileSchema,
  PartnerRegisterSchema,
} from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";
import { freePlan } from "@/lib/billing";
import { addMonthsTo } from "@/lib/time";
import type { PaymentMethodType } from "@prisma/client";

export type AuthFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

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

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) {
    return { errors: { image: avatar.error }, values };
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
      image: avatar.value,
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

// Partner signup. Distinct from registerAction because a venue has different
// fields, gets role PARTNER, and starts a subscription.
//
// The ORDER here is the design: the card is validated with the gateway BEFORE
// any account exists, so a decline is an inline form error rather than an
// orphaned half-built partner.
export async function registerPartnerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    businessName: String(formData.get("businessName") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    agreed: formData.get("agreed") === "on",
  };

  // Echoed back so inputs survive a validation error.
  const values = {
    businessName: raw.businessName,
    fullName: raw.fullName,
    email: raw.email,
    phone: raw.phone,
  };

  const parsed = PartnerRegisterSchema.safeParse(raw);
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

  // Every partner lands on the single free plan. It exists so Subscription and
  // Payment keep a valid planId and no history breaks — not because there is a
  // choice to make.
  const plan = await freePlan();
  if (!plan) {
    return {
      message:
        "Sign-ups are temporarily unavailable. Please try again in a few minutes.",
      values,
    };
  }

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) return { errors: { image: avatar.error }, values };

  // Nothing is collected at signup — joining is free, so there is no card to
  // take and no method to choose. A partner picks how to settle a service-fee
  // invoice in Billing, on the rare month they owe one.
  const method: PaymentMethodType = "GCASH";

  const now = new Date();
  // No trial: there is nothing to trial. Joining is free, so a partner starts
  // ACTIVE and their first billing period is simply the first month in which
  // service fees might accrue.
  const periodEnd = addMonthsTo(now, 1);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        // The ROUTE decides the role, never a form field.
        role: "PARTNER",
        name: data.businessName,
        playerName: data.fullName,
        email: data.email,
        phone: data.phone,
        image: avatar.value,
        passwordHash,
      },
      select: { id: true },
    });

    await tx.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "ACTIVE",
        method,
        // Nothing renews silently: an invoice is only raised when service fees
        // have actually accrued, and it is paid by opening a link.
        autoRenew: false,
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        provider: "paymongo",
      },
    });

    return user;
  });
  void created;

  // Nothing is charged at signup, and no gateway is called: the partner's first
  // job is to connect their own PayMongo account so they can take bookings.
  try {
    await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirectTo: "/dashboard/billing",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        message:
          "Your partner account was created, but automatic sign-in failed. Please log in.",
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

export type ProfileFormState = {
  ok?: boolean;
  errors?: Record<string, string>;
  message?: string;
};

// Lets a signed-in user update their own profile (account settings).
export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const { userId } = await verifySession();

  const raw = {
    name: String(formData.get("name") ?? ""),
    playerName: String(formData.get("playerName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? ""),
    privateProfile: formData.get("privateProfile") === "on",
  };

  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error) };
  }

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) {
    return { errors: { image: avatar.error } };
  }

  const data = parsed.data;
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      playerName: data.playerName ?? null,
      phone: data.phone ?? null,
      skillLevel: data.skillLevel,
      privateProfile: data.privateProfile,
      image: avatar.value,
    },
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile updated." };
}
