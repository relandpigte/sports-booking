import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { PlaceholderSection } from "@/components/dashboard/PlaceholderSection";

export const metadata: Metadata = {
  title: "Bookings — Sports 360",
};

export default async function BookingsPage() {
  const user = await getCurrentUser();
  // Bookings are a player-only feature.
  if (user?.role !== "PLAYER") redirect("/dashboard");

  return (
    <PlaceholderSection
      title="Bookings"
      subtitle="Reserve courts and manage your game sessions."
      message="Court bookings aren't available yet. Soon you'll be able to find courts, book sessions, and see your schedule here."
      icon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      }
    />
  );
}
