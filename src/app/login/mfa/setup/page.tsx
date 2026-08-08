import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthLayout } from "@/components/AuthLayout";
import { MfaSetupPanel } from "@/components/auth/MfaSetupPanel";
import {
  getSecurityChallenge,
  SECURITY_CHALLENGE_COOKIE,
  setupSecretForChallenge,
} from "@/lib/account-security";

export const metadata: Metadata = {
  title: "Secure your account — Bunal.club",
};

export default async function LoginMfaSetupPage() {
  const token = (await cookies()).get(SECURITY_CHALLENGE_COOKIE)?.value;
  const challenge = await getSecurityChallenge(token);
  if (!challenge || challenge.purpose !== "LOGIN_MFA_SETUP") redirect("/login");
  const secret = await setupSecretForChallenge(challenge);
  if (!secret) redirect("/login");
  const isPartner = challenge.user.role === "PARTNER";

  return (
    <AuthLayout
      title={
        isPartner ? "Secure your partner account" : "Secure your admin account"
      }
      subtitle={
        isPartner
          ? "Authenticator MFA is required for partners who manage bookings and payments."
          : "Authenticator MFA is required for Bunal.club administrators."
      }
      width="max-w-xl"
    >
      <div className="rounded-2xl border border-gray-200 p-5 shadow-sm sm:p-6">
        <MfaSetupPanel
          email={challenge.user.email}
          secret={secret}
          accountSetup={false}
        />
      </div>
    </AuthLayout>
  );
}
