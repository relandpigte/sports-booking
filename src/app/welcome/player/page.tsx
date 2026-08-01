import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegistrationSuccessPage } from "@/components/registration/RegistrationSuccessPage";
import { getCurrentUser } from "@/lib/dal";
import { dashboardHomeFor } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Welcome to Bunal.club",
  description: "Your Bunal.club player account is ready.",
  robots: { index: false, follow: false },
};

export default async function PlayerWelcomePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "PLAYER") redirect(dashboardHomeFor(user.role));

  return <RegistrationSuccessPage userType="player" />;
}
