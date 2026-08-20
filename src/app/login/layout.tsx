import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getSecurityChallenge,
  isLoginChallengeForUser,
  SECURITY_CHALLENGE_COOKIE,
} from "@/lib/account-security";
import { getAuthenticatedUser } from "@/lib/dal";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (user) {
    const token = (await cookies()).get(SECURITY_CHALLENGE_COOKIE)?.value;
    const challenge = await getSecurityChallenge(token);
    if (!isLoginChallengeForUser(challenge, user.id)) {
      redirect("/dashboard");
    }
  }

  return children;
}
