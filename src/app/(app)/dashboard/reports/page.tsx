import type { Metadata } from "next";
import Link from "next/link";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { RevenueReport, type StatTile } from "@/components/reports/RevenueReport";
import { requireActivePartner } from "@/lib/dal";
import { listMyHubs } from "@/lib/hubs";
import { getActivePartnerGateway } from "@/lib/partner-gateway";
import { monthRange, monthsRange, venueRevenue } from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";
import { MONTHS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Reports — Bunal.club",
};

// The partner's own takings. Reads the payment ledger, so it shows money that
// actually reached their gateway — not what was booked.
export default async function PartnerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    grain?: string;
    hub?: string;
  }>;
}) {
  const partner = await requireActivePartner();
  const sp = await searchParams;

  const now = new Date();
  const year = Number(sp.year) || now.getUTCFullYear();
  const month = Number(sp.month) || now.getUTCMonth() + 1;
  const grain = sp.grain === "month" ? "month" : "day";

  const hubs = await listMyHubs();
  // An unknown hub id would silently show everything, which is worse than
  // showing nothing — so it has to be one of theirs.
  const hubId = hubs.some((h) => h.id === sp.hub) ? sp.hub : undefined;

  const range =
    grain === "month" ? monthsRange(year, month, 12) : monthRange(year, month);
  const [series, gateway] = await Promise.all([
    venueRevenue({ partnerId: partner.id, hubId, range }),
    getActivePartnerGateway(partner.id),
  ]);

  const periodLabel =
    grain === "month"
      ? `12 months to ${MONTHS[month - 1]} ${year}`
      : `${MONTHS[month - 1]} ${year}`;

  const tiles: StatTile[] = [
    {
      label: "Court revenue",
      value: formatPHP(series.totals.gross),
      hint: `After service-fee settlement · ${periodLabel}`,
      emphasis: true,
    },
    {
      label: "Refunded",
      value: series.totals.refunds > 0 ? `−${formatPHP(series.totals.refunds)}` : "—",
      hint: "On the day it was issued",
    },
    {
      label: "Net",
      value: formatPHP(series.totals.net),
      hint: "Collected less refunds",
    },
    {
      label: "Payments",
      value: String(series.totals.count),
      hint: series.totals.count
        ? `${formatPHP(series.totals.average)} on an average ${grain === "month" ? "month" : "day"}`
        : "None yet",
    },
  ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Venue performance"
        title="Reports"
        description="Court payments that reached your own PayMongo account."
        actions={
          <PeriodPicker
            action="/dashboard/reports"
            year={year}
            month={month}
            grain={grain}
            hidden={{ hub: hubId }}
            extra={
              hubs.length > 1 ? (
                <select
                  name="hub"
                  defaultValue={hubId ?? ""}
                  aria-label="Hub"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none"
                >
                  <option value="">All hubs</option>
                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
                </select>
              ) : null
            }
          />
        }
      />

      <div className="mt-6">
        <RevenueReport
          chartId="venue"
          title={grain === "month" ? "Monthly revenue" : "Daily revenue"}
          subtitle={`Court payments ${grain === "month" ? "by month" : "by day"} · ${periodLabel}`}
          series={series}
          tiles={tiles}
          empty={
            gateway ? (
              <p className="text-sm text-gray-500">
                No online payments in {periodLabel}. Bookings settled at the
                venue don&apos;t appear here — only money that reached your
                gateway.
              </p>
            ) : (
              // The honest version of an empty chart: it isn't broken, this
              // venue simply doesn't take money online yet.
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-gray-500">
                  This hub settles at the venue, so there are no online payments
                  to report.
                </p>
                <Link
                  href="/dashboard/payments"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  Connect PayMongo to take payments online →
                </Link>
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
