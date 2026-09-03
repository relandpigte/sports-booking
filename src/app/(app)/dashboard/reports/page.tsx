import type { Metadata } from "next";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AnalyticsFilters } from "@/components/reports/AnalyticsFilters";
import { BusinessAnalyticsDashboard } from "@/components/reports/BusinessAnalyticsDashboard";
import {
  parseAnalyticsBookingFeeView,
  parseAnalyticsFilters,
  parseAnalyticsUtilizationView,
} from "@/lib/analytics-query";
import {
  getBusinessAnalytics,
  partnerAnalyticsOptions,
} from "@/lib/business-analytics";
import { requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "Analytics — Bunal.club",
};

export default async function PartnerReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [workspace, query] = await Promise.all([
    requirePartnerWorkspace("reports"),
    searchParams,
  ]);
  const options = await partnerAnalyticsOptions(workspace.partnerId);
  const filters = parseAnalyticsFilters({
    query,
    audience: "partner",
    options,
    partnerId: workspace.partnerId,
  });
  const utilizationView = parseAnalyticsUtilizationView(query);
  const bookingFeeView = parseAnalyticsBookingFeeView(query, filters);
  const data = await getBusinessAnalytics({ audience: "partner", filters });

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Analytics & business intelligence"
        title="Know what’s happening in your business"
        description="Track revenue, court demand, customers, retention, and event financial performance across your venues."
      />
      <div className="mt-6">
        <AnalyticsFilters
          key={JSON.stringify(query)}
          action="/dashboard/reports"
          audience="partner"
          filters={filters}
          options={options}
        />
      </div>
      <BusinessAnalyticsDashboard
        action="/dashboard/reports"
        audience="partner"
        data={data}
        bookingFeeView={bookingFeeView}
        utilizationView={utilizationView}
      />
    </div>
  );
}
