import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlayerHome } from "@/components/dashboard/home/PlayerHome";
import { getCurrentUser } from "@/lib/dal";
import { countMyUpcomingBookings, getMyNextBooking } from "@/lib/bookings";
import { dashboardHomeFor } from "@/lib/dashboard";
import { getMyUpcomingEventRegistrationSummary } from "@/lib/events";

export const metadata: Metadata = {
  title: "Home — Bunal.club",
};

export default async function PlayerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  // Land anyone else on their own dashboard rather than showing a blank page.
  if (user.role !== "PLAYER") redirect(dashboardHomeFor(user.role));

  const [courtBookingCount, nextBooking, eventRegistrations] = await Promise.all([
    countMyUpcomingBookings(),
    getMyNextBooking(),
    getMyUpcomingEventRegistrationSummary(),
  ]);

  return (
    <PlayerHome
      user={user}
      upcomingCount={courtBookingCount + eventRegistrations.count}
      nextBooking={nextBooking}
      nextEventRegistration={eventRegistrations.next}
    />
  );
}
