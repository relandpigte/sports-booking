import type { Metadata } from "next";

import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { requireAdmin } from "@/lib/admin";
import { pendingPartnerCount, userCounts } from "@/lib/admin";
import { pendingPayoutCount } from "@/lib/payouts";
import {
  defaultAnalyticsFilters,
  getBusinessAnalytics,
} from "@/lib/business-analytics";

export const metadata: Metadata = {
  title: "Admin Home — Bunal.club",
};

export default async function AdminDashboardPage() {
  const user = await requireAdmin();

  const [counts, pendingPartners, pendingPayouts, analytics] = await Promise.all([
    userCounts(),
    pendingPartnerCount(),
    pendingPayoutCount(),
    getBusinessAnalytics({
      audience: "owner",
      filters: defaultAnalyticsFilters(),
    }),
  ]);
  return (
    <AdminHome
      name={user.name}
      counts={counts}
      pendingPartners={pendingPartners}
      pendingPayouts={pendingPayouts}
      analytics={analytics.kpis}
    />
  );
}
