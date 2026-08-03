"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { verifySession } from "@/lib/dal";
import { isPartnerImpersonationActive } from "@/lib/impersonation";
import {
  createLoginGrant,
  completeMfaSetupChallenge,
  createSecurityChallenge,
  disableMfa,
  getSecurityChallenge,
  LOGIN_GRANT_COOKIE,
  revokeOtherSessions,
  revokeSession,
  SECURITY_CHALLENGE_COOKIE,
  verifyLoginMfaChallenge,
  verifyMfaSetupChallenge,
} from "@/lib/account-security";
import { getSecurityRequestContext } from "@/lib/security-context";

export type MfaFormState = {
  message?: string;
  recoveryCodes?: string[];
  loginGrantReady?: boolean;
  redirectTo?: string;
};

function safeInternalPath(value: string): string {
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0")
    ? value
    : "/dashboard";
}

function deleteChallengeCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete(SECURITY_CHALLENGE_COOKIE);
}

export async function verifyMfaLoginAction(
  _previous: MfaFormState,
  formData: FormData
): Promise<MfaFormState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SECURITY_CHALLENGE_COOKIE)?.value;
  if (!token) return { message: "This sign-in challenge has expired." };
  const result = await verifyLoginMfaChallenge({
    token,
    code: String(formData.get("code") ?? ""),
    useRecoveryCode: formData.get("useRecoveryCode") === "true",
    context: await getSecurityRequestContext(),
  });
  if (result.status === "expired") {
    deleteChallengeCookie(cookieStore);
    return { message: "This sign-in challenge has expired. Log in again." };
  }
  if (result.status !== "verified") {
    return { message: "That verification code is invalid or has already been used." };
  }

  deleteChallengeCookie(cookieStore);
  try {
    await signIn("credentials", {
      grant: result.grant,
      redirectTo: safeInternalPath(result.redirectTo),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "The secure sign-in grant expired. Log in again." };
    }
    throw error;
  }
  return {};
}

export async function verifyLoginMfaSetupAction(
  _previous: MfaFormState,
  formData: FormData
): Promise<MfaFormState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SECURITY_CHALLENGE_COOKIE)?.value;
  if (!token) return { message: "This setup session has expired." };
  const result = await verifyMfaSetupChallenge({
    token,
    code: String(formData.get("code") ?? ""),
    context: await getSecurityRequestContext(),
  });
  if (result.status === "expired") {
    deleteChallengeCookie(cookieStore);
    return { message: "This setup session has expired. Log in again." };
  }
  if (result.status !== "verified") {
    return { message: "That authenticator code is invalid." };
  }

  const grant = await createLoginGrant({
    userId: result.userId,
    mfaVerified: true,
    context: await getSecurityRequestContext(),
  });
  cookieStore.set(LOGIN_GRANT_COOKIE, grant, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60,
  });
  return {
    recoveryCodes: result.recoveryCodes,
    loginGrantReady: true,
    redirectTo: result.redirectTo,
  };
}

export async function completeLoginMfaSetupAction(formData: FormData) {
  const cookieStore = await cookies();
  const grant = cookieStore.get(LOGIN_GRANT_COOKIE)?.value;
  const challengeToken = cookieStore.get(SECURITY_CHALLENGE_COOKIE)?.value;
  const challenge = await getSecurityChallenge(challengeToken);
  if (!grant || !challengeToken || !challenge) redirect("/login");
  const completed = await completeMfaSetupChallenge({
    token: challengeToken,
    userId: challenge.userId,
  });
  if (!completed) redirect("/login");
  cookieStore.delete(LOGIN_GRANT_COOKIE);
  deleteChallengeCookie(cookieStore);
  await signIn("credentials", {
    grant,
    redirectTo: safeInternalPath(String(formData.get("redirectTo") ?? "")),
  });
}

export async function startAccountMfaSetupAction(): Promise<void> {
  if (await isPartnerImpersonationActive()) {
    redirect("/dashboard/account?tab=security&error=assisted");
  }
  const { userId } = await verifySession();
  const challenge = await createSecurityChallenge({
    userId,
    purpose: "ACCOUNT_MFA_SETUP",
    redirectTo: "/dashboard/account?tab=security",
  });
  (await cookies()).set(SECURITY_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  redirect("/dashboard/account?tab=security&setup=1");
}

export async function verifyAccountMfaSetupAction(
  _previous: MfaFormState,
  formData: FormData
): Promise<MfaFormState> {
  if (await isPartnerImpersonationActive()) {
    return { message: "Security settings are blocked during assisted access." };
  }
  const { userId } = await verifySession();
  const cookieStore = await cookies();
  const token = cookieStore.get(SECURITY_CHALLENGE_COOKIE)?.value;
  if (!token) return { message: "This setup session has expired." };
  const challenge = await getSecurityChallenge(token);
  if (!challenge || challenge.userId !== userId) {
    deleteChallengeCookie(cookieStore);
    return { message: "This setup session is invalid or expired." };
  }
  const result = await verifyMfaSetupChallenge({
    token,
    code: String(formData.get("code") ?? ""),
    currentPassword: String(formData.get("currentPassword") ?? ""),
    context: await getSecurityRequestContext(),
  });
  if (result.status === "password") {
    return { message: "Your current password is incorrect." };
  }
  if (result.status !== "verified") {
    return {
      message:
        result.status === "expired"
          ? "This setup session has expired."
          : "That authenticator code is invalid.",
    };
  }
  return { recoveryCodes: result.recoveryCodes };
}

export async function finishAccountMfaSetupAction(): Promise<void> {
  const { userId } = await verifySession();
  const cookieStore = await cookies();
  const token = cookieStore.get(SECURITY_CHALLENGE_COOKIE)?.value;
  if (token) {
    await completeMfaSetupChallenge({ token, userId });
    deleteChallengeCookie(cookieStore);
  }
  redirect("/dashboard/account?tab=security");
}

export async function disableMfaAction(
  _previous: MfaFormState,
  formData: FormData
): Promise<MfaFormState> {
  if (await isPartnerImpersonationActive()) {
    return { message: "Security settings are blocked during assisted access." };
  }
  const { userId } = await verifySession();
  const result = await disableMfa({
    userId,
    currentPassword: String(formData.get("currentPassword") ?? ""),
    code: String(formData.get("code") ?? ""),
    context: await getSecurityRequestContext(),
  });
  if (result === "required") {
    return { message: "Administrators are required to keep MFA enabled." };
  }
  if (result !== "disabled") {
    return { message: "The password or authenticator code is invalid." };
  }
  await signOut({ redirectTo: "/login?mfa=disabled" });
  return {};
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const { userId, sessionDatabaseId: currentSessionId } = await verifySession();
  const sessionDatabaseId = String(formData.get("sessionId") ?? "");
  if (!sessionDatabaseId) return;
  const revoked = await revokeSession({
    userId,
    sessionDatabaseId,
    context: await getSecurityRequestContext(),
  });
  if (revoked && sessionDatabaseId === currentSessionId) {
    await signOut({ redirectTo: "/login?session=revoked" });
  }
  revalidatePath("/dashboard/account");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const { userId, sessionId } = await verifySession();
  await revokeOtherSessions({
    userId,
    currentSessionId: sessionId,
    context: await getSecurityRequestContext(),
  });
  revalidatePath("/dashboard/account");
}
