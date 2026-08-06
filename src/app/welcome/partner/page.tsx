import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegistrationSuccessPage } from "@/components/registration/RegistrationSuccessPage";
import { getCurrentUser } from "@/lib/dal";
import { dashboardHomeFor } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Partner Account Created — Bunal.club",
  description: "Continue setting up your Bunal.club partner account.",
  robots: { index: false, follow: false },
};

export default async function PartnerWelcomePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "PARTNER") redirect(dashboardHomeFor(user.role));

  return <RegistrationSuccessPage userType="partner" />;
}
