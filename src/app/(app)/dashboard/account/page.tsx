import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { AccountForm } from "@/components/dashboard/AccountForm";

export const metadata: Metadata = {
  title: "Account Settings — Sports 360",
};

export default async function AccountPage() {
  const user = await getCurrentUser();

  // getCurrentUser redirects to /login when unauthenticated; this guards types.
  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        Update your profile details and privacy.
      </p>
      <AccountForm user={user} />
    </div>
  );
}
