import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser, verifySession } from "@/lib/dal";
import { AccountForm } from "@/components/dashboard/AccountForm";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";
import { SecuritySettings } from "@/components/security/SecuritySettings";
import {
  getSecurityChallenge,
  getSecurityOverview,
  SECURITY_CHALLENGE_COOKIE,
  setupSecretForChallenge,
} from "@/lib/account-security";

export const metadata: Metadata = {
  title: "Account Settings — Bunal.club",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    password?: string | string[];
    tab?: string | string[];
    setup?: string | string[];
  }>;
}) {
  const { password, tab, setup } = await searchParams;
  const [user, impersonation] = await Promise.all([
    getCurrentUser(),
    getCurrentPartnerImpersonation(),
  ]);

  // getCurrentUser redirects to /login when unauthenticated; this guards types.
  if (!user) return null;
  const activeTab = tab === "security" ? "security" : "profile";

  let security:
    | Awaited<ReturnType<typeof getSecurityOverview>>
    | null = null;
  let mfaSetup: { secret: string } | null = null;
  if (!impersonation && activeTab === "security") {
    const session = await verifySession();
    security = await getSecurityOverview({
      userId: session.userId,
      currentSessionId: session.sessionId,
    });
    if (setup === "1") {
      const token = (await cookies()).get(SECURITY_CHALLENGE_COOKIE)?.value;
      const challenge = await getSecurityChallenge(token);
      if (
        challenge?.purpose === "ACCOUNT_MFA_SETUP" &&
        challenge.userId === session.userId
      ) {
        const secret = await setupSecretForChallenge(challenge);
        if (secret) mfaSetup = { secret };
      }
    }
  }

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Profile"
        title="Account settings"
        description="Manage your public profile information and secure your Bunal.club account."
      />
      <nav
        className="mt-6 flex border-b border-gray-200"
        aria-label="Account settings"
      >
        <Link
          href="/dashboard/account"
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "profile"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 hover:text-navy"
          }`}
        >
          Profile
        </Link>
        <Link
          href="/dashboard/account?tab=security"
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "security"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 hover:text-navy"
          }`}
        >
          Security
        </Link>
      </nav>
      {impersonation ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">Account details are protected</h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Profile, email, privacy, and password changes are unavailable while
            you are assisting a partner. The partner must make these changes
            from their own signed-in session.
          </p>
        </section>
      ) : activeTab === "profile" ? (
        <AccountForm user={user} />
      ) : security ? (
        <SecuritySettings
          overview={security}
          email={user.email}
          passwordChanged={password === "changed"}
          setup={mfaSetup}
        />
      ) : null}
    </div>
  );
}
