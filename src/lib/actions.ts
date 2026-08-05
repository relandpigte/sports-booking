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
import { normalizeAvatar, normalizeCoverPhotos } from "@/lib/avatar";
import { appUrl } from "@/lib/urls";
import {
  LoginSchema,
  RegisterSchema,
  ProfileSchema,
  PartnerRegisterSchema,
} from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";
import {
  REGISTRATION_EVENT_COOKIE,
  REGISTRATION_SUCCESS_PATH,
} from "@/lib/registration-tracking";
import { endImpersonationForLogout, isPartnerImpersonationActive } from "@/lib/impersonation";
import {
  authenticatePassword,
  createLoginGrant,
  createSecurityChallenge,
  revokeSessionByToken,
  SECURITY_CHALLENGE_COOKIE,
} from "@/lib/account-security";
import { getSecurityRequestContext } from "@/lib/security-context";

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
    fullName: String(formData.get("fullName") ?? ""),
    playerName: String(formData.get("playerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    privateProfile: formData.get("privateProfile") === "on",
    agreed: formData.get("agreed") === "on",
    redirectTo: String(formData.get("redirectTo") ?? ""),
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
  const user = await prisma.user.create({
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
    select: { id: true },
  });

  await sendRegistrationWelcome({
    audience: "PLAYER",
    to: data.email,
    name: data.fullName,
    actionPath: "/hubs",
    idempotencyKey: `welcome-player-${user.id}`,
  });

  const cookieStore = await cookies();
  cookieStore.set(REGISTRATION_EVENT_COOKIE, "player", {
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

// Partner signup is separate because a venue has different fields and requires
// an admin legitimacy review before partner capabilities are unlocked.
export async function registerPartnerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    hubName: String(formData.get("hubName") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    hubAbout: String(formData.get("hubAbout") ?? ""),
    hubPhone: String(formData.get("hubPhone") ?? ""),
    hubEmail: String(formData.get("hubEmail") ?? ""),
    address: String(formData.get("address") ?? ""),
    games: formData.getAll("games").map((value) => String(value)),
    facebookPage: String(formData.get("facebookPage") ?? ""),
    agreed: formData.get("agreed") === "on",
  };

  // Echoed back so inputs survive a validation error.
  const values = {
    fullName: raw.fullName,
    email: raw.email,
    phone: raw.phone,
    hubName: raw.hubName,
    slug: raw.slug,
    hubAbout: raw.hubAbout,
    hubPhone: raw.hubPhone,
    hubEmail: raw.hubEmail,
    address: raw.address,
    // The raw text, not the canonical URL: someone correcting a typo should see
    // what they typed, not what we made of it.
    facebookPage: raw.facebookPage,
  };

  const parsed = PartnerRegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }
  const data = parsed.data;

  const [existing, slugTaken] = await Promise.all([
    prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    }),
    prisma.hub.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    }),
  ]);
  if (existing) {
    return {
      errors: { email: "An account with this email already exists" },
      values,
    };
  }
  if (slugTaken) {
    return {
      errors: { slug: "That public URL is already taken" },
      values,
    };
  }

  const logo = normalizeAvatar(String(formData.get("hubLogo") ?? ""));
  if (logo.error) return { errors: { hubLogo: logo.error }, values };

  const covers = normalizeCoverPhotos(
    formData.getAll("coverPhotos").map((value) => String(value))
  );
  if (covers.error) {
    return { errors: { coverPhotos: covers.error }, values };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const latitude = parseCoordinate(
    String(formData.get("latitude") ?? ""),
    -90,
    90
  );
  const longitude = parseCoordinate(
    String(formData.get("longitude") ?? ""),
    -180,
    180
  );

  let createdUserId: string | null = null;
  try {
    const user = await prisma.user.create({
      data: {
        // The route decides the role and status, never a form field.
        role: "PARTNER",
        partnerStatus: "PENDING",
        name: data.hubName,
        playerName: data.fullName,
        email: data.email,
        phone: data.phone,
        facebookPage: data.facebookPage ?? null,
        image: logo.value,
        passwordHash,
        hubs: {
          create: {
            name: data.hubName,
            slug: data.slug,
            about: data.hubAbout ?? null,
            logo: logo.value,
            coverPhotos: covers.values,
            games: data.games,
            address: data.address,
            latitude,
            longitude,
            phone: data.hubPhone ?? data.phone,
            email: data.hubEmail ?? data.email,
          },
        },
      },
      select: { id: true },
    });
    createdUserId = user.id;

    await sendRegistrationWelcome({
      audience: "PARTNER",
      to: data.email,
      name: data.fullName,
      venueName: data.hubName,
      actionPath: "/dashboard/partner",
      idempotencyKey: `welcome-partner-${user.id}`,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      return target.includes("email")
        ? {
            errors: { email: "An account with this email already exists" },
            values,
          }
        : {
            errors: { slug: "That public URL is already taken" },
            values,
          };
    }
    throw error;
  }

  const cookieStore = await cookies();
  cookieStore.set(REGISTRATION_EVENT_COOKIE, "partner", {
    httpOnly: false,
    maxAge: 10 * 60,
    path: "/welcome",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // The partner can sign in immediately and see the application-received
  // page, but hub and payment features stay locked until admin activation.
  try {
    if (!createdUserId) throw new Error("Partner account was not created");
    const grant = await createLoginGrant({
      userId: createdUserId,
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
      venueName: string;
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
            venueName: input.venueName,
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

function parseCoordinate(raw: string, min: number, max: number): number | null {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
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
    authentication.user.role === "ADMIN" ||
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
  const requestedRedirect = String(formData.get("redirectTo") ?? "");
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
  if (await isPartnerImpersonationActive()) {
    return {
      message:
        "Account profile changes are blocked during assisted partner access.",
    };
  }
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
