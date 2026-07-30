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

// Partner signup is separate because a venue has different fields and requires
// an admin legitimacy review before partner capabilities are unlocked.
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
    facebookPage: String(formData.get("facebookPage") ?? ""),
    agreed: formData.get("agreed") === "on",
  };

  // Echoed back so inputs survive a validation error.
  const values = {
    businessName: raw.businessName,
    fullName: raw.fullName,
    email: raw.email,
    phone: raw.phone,
    // The raw text, not the canonical URL: someone correcting a typo should see
    // what they typed, not what we made of it.
    facebookPage: raw.facebookPage,
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

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) return { errors: { image: avatar.error }, values };

  const passwordHash = await bcrypt.hash(data.password, 10);

  await prisma.user.create({
    data: {
      // The route decides the role and status, never a form field.
      role: "PARTNER",
      partnerStatus: "PENDING",
      name: data.businessName,
      playerName: data.fullName,
      email: data.email,
      phone: data.phone,
      facebookPage: data.facebookPage ?? null,
      image: avatar.value,
      passwordHash,
    },
  });

  // The partner can sign in immediately, but hub and payment features stay
  // locked until an admin activates the account.
  try {
    await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirectTo: "/dashboard/partner",
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
    facebookPage: String(formData.get("facebookPage") ?? ""),
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
      // Only written when the form actually carried the field. A player's
      // account form has no Facebook input, and an absent field means "not
      // submitted", never "cleared".
      ...(formData.has("facebookPage")
        ? { facebookPage: data.facebookPage ?? null }
        : {}),
      skillLevel: data.skillLevel,
      privateProfile: data.privateProfile,
      image: avatar.value,
    },
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile updated." };
}
