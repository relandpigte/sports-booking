import type { Metadata } from "next";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { PeriodPicker } from "@/components/reports/PeriodPicker";
import { RevenueReport, type StatTile } from "@/components/reports/RevenueReport";
import { requireActivePartner } from "@/lib/dal";
import { listMyHubs } from "@/lib/hubs";
import { getPartnerPaymentSetup } from "@/lib/manual-payments";
import {
  monthRange,
  monthsRange,
  venueRevenueBreakdown,
} from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";
import { MONTHS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Reports — Bunal.club",
};

// The partner's own takings. Reads the payment ledger, so it shows money that
// actually settled through the selected collection mode — not what was booked.
export default async function PartnerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    grain?: string;
    hub?: string;
    source?: string;
  }>;
}) {
  const partner = await requireActivePartner();
  const sp = await searchParams;

  const now = new Date();
  const year = Number(sp.year) || now.getUTCFullYear();
  const month = Number(sp.month) || now.getUTCMonth() + 1;
  const grain = sp.grain === "month" ? "month" : "day";
  const source =
    sp.source === "court" || sp.source === "event" ? sp.source : "all";

  const hubs = await listMyHubs();
  // An unknown hub id would silently show everything, which is worse than
  // showing nothing — so it has to be one of theirs.
  const hubId = hubs.some((h) => h.id === sp.hub) ? sp.hub : undefined;

  const range =
    grain === "month" ? monthsRange(year, month, 12) : monthRange(year, month);
  const [breakdown, paymentSetup] = await Promise.all([
    venueRevenueBreakdown({ partnerId: partner.id, hubId, range }),
    getPartnerPaymentSetup(partner.id),
  ]);
  const series = breakdown[source];

  const periodLabel =
    grain === "month"
      ? `12 months to ${MONTHS[month - 1]} ${year}`
      : `${MONTHS[month - 1]} ${year}`;

  const sourceLabel =
    source === "court"
      ? "court bookings"
      : source === "event"
        ? "event registrations"
        : "court bookings and event registrations";
  const tiles: StatTile[] = [
    {
      label: "Total collected",
      value: formatPHP(breakdown.all.totals.gross),
      hint: `${breakdown.all.totals.count} paid ${
        breakdown.all.totals.count === 1 ? "transaction" : "transactions"
      } · ${periodLabel}`,
      emphasis: true,
    },
    {
      label: "Court bookings",
      value: formatPHP(breakdown.court.totals.gross),
      hint: `${breakdown.court.totals.count} paid ${
        breakdown.court.totals.count === 1 ? "booking" : "bookings"
      }`,
    },
    {
      label: "Event registrations",
      value: formatPHP(breakdown.event.totals.gross),
      hint: `${breakdown.event.totals.count} paid ${
        breakdown.event.totals.count === 1 ? "registration" : "registrations"
      }`,
    },
    {
      label: "Net revenue",
      value: formatPHP(breakdown.all.totals.net),
      hint:
        breakdown.all.totals.refunds > 0
          ? `${formatPHP(breakdown.all.totals.refunds)} refunded`
          : "No refunds in this period",
    },
  ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Venue performance"
        title="Reports"
        description="Confirmed court-booking and event-registration payments across automatic and manual collection."
        actions={
          <PeriodPicker
            action="/dashboard/reports"
            year={year}
            month={month}
            grain={grain}
            hidden={{ hub: hubs.length <= 1 ? hubId : undefined }}
            extra={
              <>
                <select
                  name="source"
                  defaultValue={source}
                  aria-label="Revenue source"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none"
                >
                  <option value="all">All revenue</option>
                  <option value="court">Court bookings</option>
                  <option value="event">Event registrations</option>
                </select>
                {hubs.length > 1 ? (
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
                ) : null}
              </>
            }
          />
        }
      />

      <div className="mt-6">
        <RevenueReport
          chartId="venue"
          title={`${grain === "month" ? "Monthly" : "Daily"} ${
            source === "all"
              ? "revenue"
              : source === "court"
                ? "court revenue"
                : "event revenue"
          }`}
          subtitle={`${sourceLabel} ${grain === "month" ? "by month" : "by day"} · ${periodLabel}`}
          series={series}
          tiles={tiles}
          empty={
            <p className="text-sm text-gray-500">
              No confirmed {sourceLabel} in {periodLabel} through your current
              {paymentSetup.mode === "MANUAL" ? " manual payment setup" : " PayMongo setup"}.
            </p>
          }
        />
      </div>
    </div>
  );
}
