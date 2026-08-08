import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  createSecurityChallenge,
  SECURITY_CHALLENGE_COOKIE,
} from "@/lib/account-security";
import { prisma } from "@/lib/db";
import { dashboardHomeFor } from "@/lib/dashboard";
import { isIncompleteGoogleRegistration } from "@/lib/registration-state";
import { roleRequiresMfa } from "@/lib/mfa-policy";

function safeInternalPath(value: string | null): string {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0")
    ? value
    : "/dashboard";
}

export async function GET(request: NextRequest) {
  const redirectTo = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const session = await auth();
  if (!session?.user?.id) redirect("/login?error=OAuthCallback");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      mfaEnabledAt: true,
      registrationCompletedAt: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) redirect("/login?error=OAuthCallback");

  if (isIncompleteGoogleRegistration(user)) {
    const registrationTarget = redirectTo.startsWith("/register/google")
      ? redirectTo
      : "/register/google";
    redirect(registrationTarget);
  }

  let completedRedirect = redirectTo;
  if (redirectTo.startsWith("/register/google")) {
    const registrationUrl = new URL(redirectTo, request.nextUrl.origin);
    const requestedRole =
      registrationUrl.searchParams.get("role") === "partner" ||
      registrationUrl.pathname.endsWith("/partner")
        ? "PARTNER"
        : "PLAYER";
    if (user.role !== requestedRole) {
      completedRedirect =
        requestedRole === "PARTNER"
          ? "/register/partner?error=existing-account"
          : "/register?error=existing-account";
    } else {
      completedRedirect = dashboardHomeFor(user.role);
    }
  }

  if (session.user.sessionId && session.user.mfaVerified) {
    redirect(completedRedirect);
  }

  const requiresMfa = roleRequiresMfa(user.role) || user.mfaEnabledAt !== null;
  if (!requiresMfa) redirect("/login?error=OAuthCallback");

  const purpose = user.mfaEnabledAt ? "LOGIN_MFA" : "LOGIN_MFA_SETUP";
  const challenge = await createSecurityChallenge({
    userId: session.user.id,
    purpose,
    redirectTo: completedRedirect,
  });
  (await cookies()).set(SECURITY_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  redirect(purpose === "LOGIN_MFA" ? "/login/mfa" : "/login/mfa/setup");
}
