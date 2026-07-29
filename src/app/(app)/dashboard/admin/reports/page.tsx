import type { Metadata } from "next";
import Link from "next/link";

import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { RevenueReport, type StatTile } from "@/components/reports/RevenueReport";
import {
  marketplaceRevenue,
  monthRange,
  monthsRange,
  platformRevenue,
} from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";
import { MONTHS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Reports — Bunal.ph",
};

// Two questions, two tabs, one component.
//
//   Platform    — what partners paid Bunal.ph. The money that is actually ours.
//   Marketplace — what players paid venues. Whether the product is being used.
//
// Kept apart deliberately: adding them together would produce a number that
// means nothing, since only the first is revenue we ever see.
const VIEWS = [
  { key: "platform", label: "Platform revenue" },
  { key: "marketplace", label: "Marketplace" },
] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    grain?: string;
    view?: string;
  }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "marketplace" ? "marketplace" : "platform";

  const now = new Date();
  const year = Number(sp.year) || now.getUTCFullYear();
  const month = Number(sp.month) || now.getUTCMonth() + 1;
  const grain = sp.grain === "month" ? "month" : "day";
  const range =
    grain === "month" ? monthsRange(year, month, 12) : monthRange(year, month);

  // requireAdmin lives inside each builder, so this page has no guard of its
  // own to drift out of sync.
  const platform = view === "platform" ? await platformRevenue(range) : null;
  const marketplace = view === "marketplace" ? await marketplaceRevenue(range) : null;
  const series = platform ?? marketplace!;

  const periodLabel =
    grain === "month"
      ? `12 months to ${MONTHS[month - 1]} ${year}`
      : `${MONTHS[month - 1]} ${year}`;

  const tiles: StatTile[] = platform
    ? [
        {
          label: "Collected",
          value: formatPHP(platform.totals.gross),
          hint: periodLabel,
          emphasis: true,
        },
        {
          label: "Refunded",
          value:
            platform.totals.refunds > 0
              ? `−${formatPHP(platform.totals.refunds)}`
              : "—",
          hint: "On the day it was issued",
        },
        {
          label: "Payments",
          value: String(platform.totals.count),
          hint: "Subscription charges settled",
        },
        {
          label: "Comped",
          value: String(platform.comped),
          // A comped month moves no money but is still a decision someone made.
          hint: platform.comped ? "Months given away (₱0)" : "None",
        },
      ]
    : [
        {
          label: "Court payments",
          value: formatPHP(series.totals.gross),
          hint: periodLabel,
          emphasis: true,
        },
        {
          label: "Refunded",
          value:
            series.totals.refunds > 0 ? `−${formatPHP(series.totals.refunds)}` : "—",
          hint: "By venues, to players",
        },
        {
          label: "Net to venues",
          value: formatPHP(series.totals.net),
          hint: "Bunal.ph takes no cut",
        },
        {
          label: "Payments",
          value: String(series.totals.count),
          hint: series.totals.count
            ? `${formatPHP(series.totals.average)} on an average ${grain === "month" ? "month" : "day"}`
            : "None yet",
        },
      ];

  const query = (next: string) =>
    `/dashboard/admin/reports?view=${next}&year=${year}&month=${month}&grain=${grain}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            What partners pay Bunal.ph, and what players pay venues.
          </p>
        </div>

        <PeriodPicker
          action="/dashboard/admin/reports"
          year={year}
          month={month}
          grain={grain}
          hidden={{ view }}
        />
      </div>

      {/* Links, not client state: each tab is its own URL. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {VIEWS.map((tab) => (
          <Link
            key={tab.key}
            href={query(tab.key)}
            aria-current={view === tab.key ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              view === tab.key
                ? "border-primary bg-primary text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <RevenueReport
          chartId={view}
          title={grain === "month" ? "Monthly revenue" : "Daily revenue"}
          subtitle={
            platform
              ? `Subscription payments ${grain === "month" ? "by month" : "by day"} · ${periodLabel}`
              : `Court payments across every venue · ${periodLabel}`
          }
          series={series}
          tiles={tiles}
          empty={
            platform ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-gray-500">
                  No subscription payments settled in {periodLabel}.
                </p>
                <Link
                  href="/dashboard/admin/subscriptions"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  See who owes and collect →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No venue took an online payment in {periodLabel}. Hubs that
                settle at the venue don&apos;t appear here.
              </p>
            )
          }
        />
      </div>
    </div>
  );
}
