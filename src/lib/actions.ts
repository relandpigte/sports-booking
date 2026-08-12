"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { auth, signIn, signOut } from "@/lib/auth";
import { verifySession } from "@/lib/dal";
import {
  emailDeliveryConfigured,
  sendWelcomeEmail,
} from "@/lib/email";
import { normalizeAvatar } from "@/lib/avatar";
import { appUrl } from "@/lib/urls";
import {
  LoginSchema,
  RegisterSchema,
  ProfileSchema,
} from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";
import {
  REGISTRATION_EVENT_COOKIE,
  REGISTRATION_SUCCESS_PATH,
} from "@/lib/registration-tracking";
import {
  endImpersonationForLogout,
  getWorkspaceMutationTarget,
  recordImpersonatedAction,
} from "@/lib/impersonation";
import {
  authenticatePassword,
  createLoginGrant,
  createSecurityChallenge,
  revokeSessionByToken,
  SECURITY_CHALLENGE_COOKIE,
} from "@/lib/account-security";
import { getSecurityRequestContext } from "@/lib/security-context";
import { roleRequiresMfa } from "@/lib/mfa-policy";
import { consumeRateLimit } from "@/lib/rate-limit";

export type AuthFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

function safeInternalPath(value: string): string | null {
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0")
    ? value
    : null;
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectTo: String(formData.get("redirectTo") ?? ""),
  };

  // Values echoed back to the form so inputs survive a validation error.
  const values = {
    email: raw.email,
  };

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }

  const data = parsed.data;

  const registrationContext = await getSecurityRequestContext();
  if (!(await consumeRateLimit({
    namespace: "register-player",
    subject: registrationContext.ipHash,
    limit: 5,
    windowSeconds: 60 * 60,
  }))) {
    return { message: "Too many registration attempts. Try again later.", values };
  }

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
  let user: { id: string };
  try {
    user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { email: "An account with this email already exists" },
        values,
      };
    }
    throw error;
  }

  await sendRegistrationWelcome({
    audience: "PLAYER",
    to: data.email,
    name: "there",
    actionPath: "/hubs",
    idempotencyKey: `welcome-player-${user.id}`,
  });

  const cookieStore = await cookies();
  cookieStore.set(REGISTRATION_EVENT_COOKIE, "player:credentials", {
    httpOnly: false,
    maxAge: 10 * 60,
    path: "/welcome",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // Sign the new user in. On success this throws a redirect to the welcome
  // page, where the short-lived marker emits one registration event.
  try {
    const grant = await createLoginGrant({
      userId: user.id,
      mfaVerified: true,
      context: await getSecurityRequestContext(),
    });
    await signIn("credentials", {
      grant,
      redirectTo: safeInternalPath(raw.redirectTo)
        ? `${REGISTRATION_SUCCESS_PATH.player}?next=${encodeURIComponent(raw.redirectTo)}`
          : REGISTRATION_SUCCESS_PATH.player,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      cookieStore.set(REGISTRATION_EVENT_COOKIE, "", {
        maxAge: 0,
        path: "/welcome",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
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

// Partner signup creates only a signed-in draft. Owner and venue information
// is submitted later from the protected onboarding flow.
export async function registerPartnerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  // Echoed back so inputs survive a validation error.
  const values = {
    email: raw.email,
  };

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }
  const data = parsed.data;

  const registrationContext = await getSecurityRequestContext();
  if (!(await consumeRateLimit({
    namespace: "register-partner",
    subject: registrationContext.ipHash,
    limit: 3,
    windowSeconds: 60 * 60,
  }))) {
    return { message: "Too many registration attempts. Try again later.", values };
  }

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
  let user: { id: string };
  try {
    user = await prisma.user.create({
      data: {
        role: "PARTNER",
        partnerStatus: "DRAFT",
        email: data.email,
        passwordHash,
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { email: "An account with this email already exists" },
        values,
      };
    }
    throw error;
  }

  await sendRegistrationWelcome({
    audience: "PARTNER",
    to: data.email,
    name: "there",
    actionPath: "/dashboard/partner",
    idempotencyKey: `welcome-partner-${user.id}`,
  });

  const cookieStore = await cookies();
  cookieStore.set(REGISTRATION_EVENT_COOKIE, "partner:credentials", {
    httpOnly: false,
    maxAge: 10 * 60,
    path: "/welcome",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  if (roleRequiresMfa("PARTNER")) {
    const challenge = await createSecurityChallenge({
      userId: user.id,
      purpose: "LOGIN_MFA_SETUP",
      redirectTo: REGISTRATION_SUCCESS_PATH.partner,
    });
    cookieStore.set(SECURITY_CHALLENGE_COOKIE, challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    redirect("/login/mfa/setup");
  }

  // The partner signs in immediately, but venue operations stay locked while
  // the account is a draft and while the submitted application is reviewed.
  try {
    const grant = await createLoginGrant({
      userId: user.id,
      mfaVerified: true,
      context: await getSecurityRequestContext(),
    });
    await signIn("credentials", {
      grant,
      redirectTo: REGISTRATION_SUCCESS_PATH.partner,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      cookieStore.set(REGISTRATION_EVENT_COOKIE, "", {
        maxAge: 0,
        path: "/welcome",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
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

type RegistrationWelcomeInput =
  | {
      audience: "PLAYER";
      to: string;
      name: string;
      actionPath: string;
      idempotencyKey: string;
    }
  | {
      audience: "PARTNER";
      to: string;
      name: string;
      actionPath: string;
      idempotencyKey: string;
    };

async function sendRegistrationWelcome(
  input: RegistrationWelcomeInput
): Promise<void> {
  if (!emailDeliveryConfigured()) return;

  try {
    const actionUrl = appUrl(input.actionPath);
    await sendWelcomeEmail(
      input.audience === "PLAYER"
        ? {
            audience: input.audience,
            to: input.to,
            name: input.name,
            actionUrl,
            idempotencyKey: input.idempotencyKey,
          }
        : {
            audience: input.audience,
            to: input.to,
            name: input.name,
            actionUrl,
            idempotencyKey: input.idempotencyKey,
          }
    );
  } catch (error) {
    // Account creation is the source of truth. A provider outage should not
    // strand a new user after their row has already been committed.
    console.error(
      "Welcome email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectTo: String(formData.get("redirectTo") ?? ""),
  };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values: { email: raw.email } };
  }

  const context = await getSecurityRequestContext();
  const authentication = await authenticatePassword({
    email: parsed.data.email,
    password: parsed.data.password,
    context,
  });
  if (authentication.status === "blocked") {
    return {
      message:
        "Too many sign-in attempts. Wait a few minutes and try again.",
      values: { email: raw.email },
    };
  }
  if (authentication.status === "invalid") {
    return {
      message: "Invalid email or password",
      values: { email: raw.email },
    };
  }

  const redirectTo = safeInternalPath(raw.redirectTo) ?? "/dashboard";
  const requiresMfa =
    roleRequiresMfa(authentication.user.role) ||
    authentication.user.mfaEnabledAt !== null;
  if (requiresMfa) {
    const purpose = authentication.user.mfaEnabledAt
      ? "LOGIN_MFA"
      : "LOGIN_MFA_SETUP";
    try {
      const challenge = await createSecurityChallenge({
        userId: authentication.user.id,
        purpose,
        redirectTo,
      });
      (await cookies()).set(SECURITY_CHALLENGE_COOKIE, challenge, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      });
    } catch (error) {
      return {
        message:
          error instanceof Error
            ? error.message
            : "Multi-factor authentication is temporarily unavailable.",
        values: { email: raw.email },
      };
    }
    redirect(
      purpose === "LOGIN_MFA" ? "/login/mfa" : "/login/mfa/setup"
    );
  }

  try {
    const grant = await createLoginGrant({
      userId: authentication.user.id,
      mfaVerified: true,
      context,
    });
    await signIn("credentials", {
      grant,
      redirectTo,
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

export async function googleLoginAction(formData: FormData): Promise<void> {
  const requestedRedirect = String(
    formData.get("googleRedirectTo") ?? formData.get("redirectTo") ?? ""
  );
  const redirectTo = safeInternalPath(requestedRedirect) ?? "/dashboard";
  const completionUrl = `/api/auth/google/complete?next=${encodeURIComponent(
    redirectTo
  )}`;

  await signIn("google", { redirectTo: completionUrl });
}

export async function logoutAction() {
  await endImpersonationForLogout();
  const session = await auth();
  if (session?.user?.id && session.user.sessionId) {
    await revokeSessionByToken({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      context: await getSecurityRequestContext(),
    });
  }
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
  await verifySession();
  const target = await getWorkspaceMutationTarget();

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

  const avatar = await normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) {
    return { errors: { image: avatar.error } };
  }

  const data = parsed.data;
  await prisma.user.update({
    where: { id: target.userId },
    data: {
      name: data.name ?? null,
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

  await recordImpersonatedAction({
    action: "PARTNER_PROFILE_UPDATED",
    targetType: "User",
    targetId: target.userId,
    metadata: {
      fields: [
        "name",
        "playerName",
        "phone",
        ...(formData.has("facebookPage") ? ["facebookPage"] : []),
        "skillLevel",
        "privateProfile",
        "image",
      ],
    },
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile updated." };
}
