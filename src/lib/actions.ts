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
  CardSchema,
} from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";
import { getPlanByKey } from "@/lib/billing";
import { getPaymentProvider, type ProviderMethod } from "@/lib/payments";
import { addDaysTo } from "@/lib/time";
import { TRIAL_DAYS } from "@/lib/constants";
import type { PaymentMethodType, PlanKey } from "@prisma/client";

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
    planKey: String(formData.get("planKey") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
    agreed: formData.get("agreed") === "on",
  };

  // Echoed back so inputs survive a validation error. Card fields are
  // deliberately absent — a card number must never round-trip through form state.
  const values = {
    businessName: raw.businessName,
    fullName: raw.fullName,
    email: raw.email,
    phone: raw.phone,
    planKey: raw.planKey,
    paymentMethod: raw.paymentMethod,
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

  const plan = await getPlanByKey(data.planKey as PlanKey);
  if (!plan) return { errors: { planKey: "That plan is unavailable" }, values };

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) return { errors: { image: avatar.error }, values };

  const provider = getPaymentProvider();
  const method = data.paymentMethod as PaymentMethodType;

  // Tokenize the card first — a decline must not cost us a half-created account.
  let card: ProviderMethod | null = null;
  if (method === "CARD") {
    const cardParsed = CardSchema.safeParse({
      cardName: String(formData.get("cardName") ?? ""),
      cardNumber: String(formData.get("cardNumber") ?? ""),
      cardExpMonth: String(formData.get("cardExpMonth") ?? ""),
      cardExpYear: String(formData.get("cardExpYear") ?? ""),
      cardCvc: String(formData.get("cardCvc") ?? ""),
    });
    if (!cardParsed.success) {
      return { errors: firstErrors(cardParsed.error), values };
    }
    try {
      card = await provider.createPaymentMethod({
        type: "CARD",
        card: {
          number: cardParsed.data.cardNumber,
          expMonth: cardParsed.data.cardExpMonth,
          expYear: cardParsed.data.cardExpYear,
          cvc: cardParsed.data.cardCvc,
          name: cardParsed.data.cardName,
        },
      });
    } catch (error) {
      return {
        errors: {
          cardNumber:
            error instanceof Error
              ? error.message
              : "That card could not be verified.",
        },
        values,
      };
    }
  }

  const now = new Date();
  const trialEndsAt = addDaysTo(now, TRIAL_DAYS);
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
        status: "TRIALING",
        method,
        // Only a stored card can auto-renew. E-wallets are never charged
        // without the partner approving it.
        autoRenew: method === "CARD",
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        provider: provider.id,
      },
    });

    if (card) {
      await tx.savedPaymentMethod.create({
        data: {
          userId: user.id,
          type: "CARD",
          isDefault: true,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.expMonth,
          expYear: card.expYear,
          provider: provider.id,
          providerMethodId: card.methodId,
        },
      });
    }

    return user;
  });

  // Best effort: a gateway hiccup must never cost the partner their account.
  // Without a customer id the billing page just asks them to finish setup.
  try {
    const customer = await provider.createCustomer({
      appUserId: created.id,
      email: data.email,
      name: data.businessName,
      phone: data.phone,
    });
    await prisma.subscription.update({
      where: { userId: created.id },
      data: { providerCustomerId: customer.customerId },
    });
    if (card) {
      await provider.attachPaymentMethod(customer.customerId, card.methodId);
    }
  } catch {
    // Non-fatal by design.
  }

  // No charge is taken during the trial. Land them on billing so the trial end
  // date is the first thing they see.
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
