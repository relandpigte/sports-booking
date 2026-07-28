import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { userCounts } from "@/lib/admin";
import { countMyUpcomingBookings, getMyNextBooking } from "@/lib/bookings";
import { getBillingOverview } from "@/lib/billing";
import { formatPHP } from "@/lib/currency";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import type { BadgeTone } from "@/components/ui/Badge";
import type { SubscriptionStatus } from "@prisma/client";

const PARTNER_STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  TRIALING: "primary",
  ACTIVE: "success",
  PAST_DUE: "warn",
  UNPAID: "danger",
  CANCELLED: "danger",
};
import { PlayerHome } from "@/components/dashboard/home/PlayerHome";
import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { PartnerHome } from "@/components/dashboard/home/PartnerHome";

export const metadata: Metadata = {
  title: "Home — Sports 360",
};

export default async function DashboardHome() {
  const user = await getCurrentUser();
  // getCurrentUser redirects to /login when unauthenticated; this guards types.
  if (!user) return null;

  if (user.role === "ADMIN") {
    const counts = await userCounts();
    return <AdminHome name={user.name} counts={counts} />;
  }

  if (user.role === "PARTNER") {
    const overview = await getBillingOverview();
    const billing = overview
      ? {
          planName: overview.plan.name,
          statusLabel: SUBSCRIPTION_STATUS_LABELS[overview.subscription.status],
          tone: PARTNER_STATUS_TONE[overview.subscription.status],
          detail:
            overview.amountDue != null
              ? `${formatPHP(overview.amountDue)} due — pay to keep your hubs listed.`
              : `${formatPHP(overview.plan.priceMonthly)}/mo · ${
                  overview.subscription.autoRenew
                    ? "renews automatically"
                    : "you pay manually each month"
                }`,
          usage:
            overview.plan.maxCourts == null
              ? `${overview.courtCount} courts · unlimited`
              : `${overview.courtCount} of ${overview.plan.maxCourts} courts used`,
        }
      : null;
    return <PartnerHome user={user} billing={billing} />;
  }

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
