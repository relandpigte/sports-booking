import type { Metadata } from "next";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AnalyticsFilters } from "@/components/reports/AnalyticsFilters";
import { BusinessAnalyticsDashboard } from "@/components/reports/BusinessAnalyticsDashboard";
import { requireAdmin } from "@/lib/admin";
import { parseAnalyticsFilters } from "@/lib/analytics-query";
import {
  getBusinessAnalytics,
  ownerAnalyticsOptions,
} from "@/lib/business-analytics";

export const metadata: Metadata = {
  title: "Platform Analytics — Bunal.club",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, query] = await Promise.all([requireAdmin(), searchParams]);
  const options = await ownerAnalyticsOptions();
  const filters = parseAnalyticsFilters({
    query,
    audience: "owner",
    options,
  });
  const data = await getBusinessAnalytics({ audience: "owner", filters });

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Platform analytics & business intelligence"
        title="Platform performance"
        description="Monitor GMV, Bunal service fees, venue and trainer shares, utilization, customer growth, and retention."
      />
      <div className="mt-6">
        <AnalyticsFilters
          action="/dashboard/admin/reports"
          audience="owner"
          filters={filters}
          options={options}
        />
      </div>
      <BusinessAnalyticsDashboard audience="owner" data={data} />
    </div>
  );
}
