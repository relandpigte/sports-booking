import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthLayout } from "@/components/AuthLayout";
import { MfaLoginForm } from "@/components/auth/MfaLoginForm";
import {
  getSecurityChallenge,
  SECURITY_CHALLENGE_COOKIE,
} from "@/lib/account-security";

export const metadata: Metadata = {
  title: "Verify sign-in — Bunal.club",
};

export default async function MfaLoginPage() {
  const token = (await cookies()).get(SECURITY_CHALLENGE_COOKIE)?.value;
  const challenge = await getSecurityChallenge(token);
  if (!challenge || challenge.purpose !== "LOGIN_MFA") redirect("/login");

  return (
    <AuthLayout
      title="Verify your sign-in"
      subtitle="Enter the code from your authenticator app to continue."
    >
      <MfaLoginForm />
    </AuthLayout>
  );
}

