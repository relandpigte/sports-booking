import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import {
  createSecurityChallenge,
  SECURITY_CHALLENGE_COOKIE,
} from "@/lib/account-security";
import { prisma } from "@/lib/db";

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
  if (session.user.sessionId && session.user.mfaVerified) redirect(redirectTo);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, mfaEnabledAt: true },
  });
  if (!user) redirect("/login?error=OAuthCallback");

  const requiresMfa = user.role === "ADMIN" || user.mfaEnabledAt !== null;
  if (!requiresMfa) redirect("/login?error=OAuthCallback");

  const purpose = user.mfaEnabledAt ? "LOGIN_MFA" : "LOGIN_MFA_SETUP";
  const challenge = await createSecurityChallenge({
    userId: session.user.id,
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
  redirect(purpose === "LOGIN_MFA" ? "/login/mfa" : "/login/mfa/setup");
}
