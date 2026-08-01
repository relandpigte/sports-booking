import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { AccountForm } from "@/components/dashboard/AccountForm";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export const metadata: Metadata = {
  title: "Account Settings — Bunal.club",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string | string[] }>;
}) {
  const { password } = await searchParams;
  const user = await getCurrentUser();

  // getCurrentUser redirects to /login when unauthenticated; this guards types.
  if (!user) return null;

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Profile"
        title="Account settings"
        description="Update your contact details, player profile, and privacy preferences."
      />
      <AccountForm user={user} />
      <ChangePasswordForm
        changed={password === "changed"}
        email={user.email}
      />
    </div>
  );
}
