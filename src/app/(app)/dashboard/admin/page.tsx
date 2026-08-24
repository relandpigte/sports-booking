import type { Metadata } from "next";

import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { requireAdmin } from "@/lib/admin";
import { pendingPartnerCount, userCounts } from "@/lib/admin";
import { pendingServiceFeeSettlementCount } from "@/lib/service-fees";
import {
  defaultAnalyticsFilters,
  getBusinessAnalytics,
} from "@/lib/business-analytics";

export const metadata: Metadata = {
  title: "Admin Home — Bunal.club",
};

export default async function AdminDashboardPage() {
  const user = await requireAdmin();

  const [counts, pendingPartners, pendingSettlements, analytics] = await Promise.all([
    userCounts(),
    pendingPartnerCount(),
    pendingServiceFeeSettlementCount(),
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
      pendingSettlements={pendingSettlements}
      analytics={analytics.kpis}
    />
  );
}
