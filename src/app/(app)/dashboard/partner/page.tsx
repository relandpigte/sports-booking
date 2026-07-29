import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SubscriptionStatus } from "@prisma/client";

import { PartnerHome } from "@/components/dashboard/home/PartnerHome";
import type { BadgeTone } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/dal";
import { getBillingOverview } from "@/lib/billing";
import { formatPHP } from "@/lib/currency";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import { dashboardHomeFor } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Partner Home — Bunal.ph",
};

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  TRIALING: "primary",
  ACTIVE: "success",
  PAST_DUE: "warn",
  UNPAID: "danger",
  CANCELLED: "danger",
};

export default async function PartnerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "PARTNER") redirect(dashboardHomeFor(user.role));

  const overview = await getBillingOverview();
  const billing = overview
    ? {
        planName: overview.plan.name,
        statusLabel: SUBSCRIPTION_STATUS_LABELS[overview.subscription.status],
        tone: STATUS_TONE[overview.subscription.status],
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
