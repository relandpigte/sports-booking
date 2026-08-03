import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { AccountForm } from "@/components/dashboard/AccountForm";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";

export const metadata: Metadata = {
  title: "Account Settings — Bunal.club",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string | string[] }>;
}) {
  const { password } = await searchParams;
  const [user, impersonation] = await Promise.all([
    getCurrentUser(),
    getCurrentPartnerImpersonation(),
  ]);

  // getCurrentUser redirects to /login when unauthenticated; this guards types.
  if (!user) return null;

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Profile"
        title="Account settings"
        description="Update your contact details, player profile, and privacy preferences."
      />
      {impersonation ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">Account details are protected</h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Profile, email, privacy, and password changes are unavailable while
            you are assisting a partner. The partner must make these changes
            from their own signed-in session.
          </p>
        </section>
      ) : (
        <>
      <AccountForm user={user} />
      <ChangePasswordForm
        changed={password === "changed"}
        email={user.email}
      />
        </>
      )}
    </div>
  );
}
