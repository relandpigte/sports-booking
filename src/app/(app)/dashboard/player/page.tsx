import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlayerHome } from "@/components/dashboard/home/PlayerHome";
import { getCurrentUser } from "@/lib/dal";
import { countMyUpcomingBookings, getMyNextBooking } from "@/lib/bookings";
import { dashboardHomeFor } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Home — Sports 360",
};

export default async function PlayerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  // Land anyone else on their own dashboard rather than showing a blank page.
  if (user.role !== "PLAYER") redirect(dashboardHomeFor(user.role));

  const [upcomingCount, nextBooking] = await Promise.all([
    countMyUpcomingBookings(),
    getMyNextBooking(),
  ]);

  return (
    <PlayerHome
      user={user}
      upcomingCount={upcomingCount}
      nextBooking={nextBooking}
    />
  );
}
