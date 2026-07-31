import type { Metadata } from "next";

import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { RevenueReport, type StatTile } from "@/components/reports/RevenueReport";
import {
  marketplaceRevenue,
  monthRange,
  monthsRange,
} from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";
import { MONTHS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Reports — Bunal.club",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    grain?: string;
  }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getUTCFullYear();
  const month = Number(sp.month) || now.getUTCMonth() + 1;
  const grain = sp.grain === "month" ? "month" : "day";
  const range =
    grain === "month" ? monthsRange(year, month, 12) : monthRange(year, month);
  const marketplace = await marketplaceRevenue(range);

  const periodLabel =
    grain === "month"
      ? `12 months to ${MONTHS[month - 1]} ${year}`
      : `${MONTHS[month - 1]} ${year}`;

  const tiles: StatTile[] = [
    {
      label: "Accrued service fees",
      value: formatPHP(marketplace.serviceFees),
      hint: `Fixed booking fees · ${periodLabel}`,
      emphasis: true,
    },
    {
      label: "Court payments",
      value: formatPHP(marketplace.totals.gross),
      hint: "Gross, service fee included",
    },
    {
      label: "To venues",
      value: formatPHP(marketplace.venueShare),
      hint: "Retained after fee settlement",
    },
    {
      label: "Payments",
      value: String(marketplace.totals.count),
      hint: marketplace.totals.count
        ? `${formatPHP(marketplace.totals.average)} on an average ${
            grain === "month" ? "month" : "day"
          }`
        : "None yet",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Player payments, venue shares, and per-booking service fees.
          </p>
        </div>
        <PeriodPicker
          action="/dashboard/admin/reports"
          year={year}
          month={month}
          grain={grain}
        />
      </div>

      <div className="mt-6">
        <RevenueReport
          chartId="marketplace"
          title={grain === "month" ? "Monthly payments" : "Daily payments"}
          subtitle={`Court payments across every venue · ${periodLabel}`}
          series={marketplace}
          tiles={tiles}
          empty={
            <p className="text-sm text-gray-500">
              No venue took an online payment in {periodLabel}.
            </p>
          }
        />
      </div>
    </div>
  );
}
