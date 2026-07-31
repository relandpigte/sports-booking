import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { PlaceholderSection } from "@/components/dashboard/PlaceholderSection";

export const metadata: Metadata = {
  title: "Tournaments — Bunal.club",
};

export default async function TournamentsPage() {
  const user = await getCurrentUser();
  // Tournaments are a player-only feature.
  if (user?.role !== "PLAYER") redirect("/dashboard");

  return (
    <PlaceholderSection
      title="Tournaments"
      subtitle="Join competitive brackets and track your results."
      message="Tournaments aren't available yet. Soon you'll be able to browse, register for, and follow tournaments here."
      icon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 4h12v3a6 6 0 0 1-12 0z" />
          <path d="M6 5H4v2a3 3 0 0 0 3 3M18 5h2v2a3 3 0 0 1-3 3" />
          <path d="M9 18h6M10 14v4M14 14v4M8 21h8" />
        </svg>
      }
    />
  );
}
