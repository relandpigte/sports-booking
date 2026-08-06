"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";

import { createLoginGrant } from "@/lib/account-security";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendWelcomeEmail } from "@/lib/email";
import {
  REGISTRATION_EVENT_COOKIE,
  REGISTRATION_SUCCESS_PATH,
} from "@/lib/registration-tracking";
import { getSecurityRequestContext } from "@/lib/security-context";
import { appUrl } from "@/lib/urls";
import { GoogleRegistrationSchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";

export type GoogleRegistrationFormState = {
  errors?: Record<string, string>;
  message?: string;
};

function safeInternalPath(value: string): string | null {
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0")
    ? value
    : null;
}

async function setRegistrationCookie(type: "player" | "partner") {
  (await cookies()).set(REGISTRATION_EVENT_COOKIE, `${type}:google`, {
    httpOnly: false,
    maxAge: 10 * 60,
    path: "/welcome",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function sendGoogleWelcome(input: {
  userId: string;
  type: "player" | "partner";
  email: string;
  name: string;
}) {
  if (!emailDeliveryConfigured()) return;
  try {
    await sendWelcomeEmail(
      input.type === "player"
        ? {
            audience: "PLAYER",
            to: input.email,
            name: input.name,
            actionUrl: appUrl("/hubs"),
            idempotencyKey: `welcome-player-${input.userId}`,
          }
        : {
            audience: "PARTNER",
            to: input.email,
            name: input.name,
            actionUrl: appUrl("/dashboard/partner"),
            idempotencyKey: `welcome-partner-${input.userId}`,
          }
    );
  } catch (error) {
    console.error(
      "Google registration welcome email failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

async function signInCompletedGoogleUser({
  userId,
  redirectTo,
}: {
  userId: string;
  redirectTo: string;
}): Promise<GoogleRegistrationFormState> {
  try {
    const grant = await createLoginGrant({
      userId,
      mfaVerified: true,
      context: await getSecurityRequestContext(),
    });
    await signIn("credentials", { grant, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        message:
          "Your account was created, but automatic sign-in failed. Continue with Google again.",
      };
    }
    throw error;
  }
  return {};
}

export async function completeGoogleRegistrationAction(
  _previous: GoogleRegistrationFormState,
  formData: FormData
): Promise<GoogleRegistrationFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { message: "Your Google registration session expired. Start again." };
  }

  const parsed = GoogleRegistrationSchema.safeParse({
    role: String(formData.get("role") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true },
  });
  if (!user) return { message: "This Google account is no longer available." };

  const claimed = await prisma.user.updateMany({
    where: {
      id: session.user.id,
      registrationCompletedAt: null,
      passwordHash: null,
      accounts: { some: { provider: "google" } },
    },
    data: {
      role: parsed.data.role,
      partnerStatus: parsed.data.role === "PARTNER" ? "DRAFT" : null,
      registrationCompletedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    return { message: "This Google account has already been registered." };
  }

  const type = parsed.data.role === "PARTNER" ? "partner" : "player";
  await sendGoogleWelcome({
    userId: session.user.id,
    type,
    email: user.email,
    name: user.name?.trim() || "there",
  });
  await setRegistrationCookie(type);

  const requestedNext = safeInternalPath(String(formData.get("next") ?? ""));
  const redirectTo =
    type === "player" && requestedNext
      ? `${REGISTRATION_SUCCESS_PATH.player}?next=${encodeURIComponent(
          requestedNext
        )}`
      : REGISTRATION_SUCCESS_PATH[type];

  return signInCompletedGoogleUser({
    userId: session.user.id,
    redirectTo,
  });
}
