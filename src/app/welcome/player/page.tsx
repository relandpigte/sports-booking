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

export default async function PlayerWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "PLAYER") redirect(dashboardHomeFor(user.role));
  const query = await searchParams;
  const requested = Array.isArray(query.next) ? query.next[0] : query.next;
  const next =
    requested?.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes("\\") &&
    !requested.includes("\0")
      ? requested
      : undefined;

  return (
    <RegistrationSuccessPage
      userType="player"
      primaryAction={
        next ? { label: "Continue to event", href: next } : undefined
      }
    />
  );
}
