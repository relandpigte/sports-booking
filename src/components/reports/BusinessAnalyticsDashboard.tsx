import Link from "next/link";

import type { RevenuePoint } from "@/lib/analytics";
import { courtPaymentFeePage } from "@/lib/analytics-booking-fees";
import {
  addAnalyticsBookingFeeParams,
  addAnalyticsUtilizationParams,
  analyticsSearchParams,
  type AnalyticsBookingFeeView,
  type AnalyticsUtilizationView,
} from "@/lib/analytics-query";
import type {
  BusinessAnalyticsData,
  BusinessAnalyticsFilters,
  CourtPaymentBreakdownRow,
  EventPerformanceRow,
} from "@/lib/business-analytics";
import { formatPHP } from "@/lib/currency";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

import { RevenueChart } from "./RevenueChart";
import { UtilizationReport } from "./UtilizationReport";

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function change(current: number, previous: number | undefined) {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Comparison({ value }: { value: number | null }) {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${positive ? "bg-primary-soft text-primary" : "bg-red-50 text-red-600"}`}>
      {positive ? "↑" : "↓"} {Math.abs(value).toFixed(1)}% vs previous
    </span>
  );
}

function KpiCard({ label, value, note, delta, primary = false }: { label: string; value: string; note: string; delta: number | null; primary?: boolean }) {
  return (
    <article className={`rounded-2xl border p-4 shadow-sm shadow-navy/5 ${primary ? "border-primary/25 bg-primary-soft/60" : "border-[#dfe7e2] bg-white"}`}>
      <p className={`text-[11px] font-black uppercase tracking-[0.13em] ${primary ? "text-primary" : "text-slate-400"}`}>{label}</p>
      <p className="mt-2 text-2xl font-black text-navy">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
      <Comparison value={delta} />
    </article>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-black text-navy">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function paymentDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function paymentReference(value: string) {
  return value.length > 18 ? `…${value.slice(-14)}` : value;
}

function deduction(value: number) {
  return value > 0 ? `−${formatPHP(value)}` : formatPHP(0);
}

function EventFinancialPerformance({
  audience,
  rows,
}: {
  audience: "partner" | "owner";
  rows: EventPerformanceRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
        No paid events match these filters.
      </div>
    );
  }

  if (audience === "partner") {
    return (
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400"><th className="pb-3">Event</th><th className="pb-3">Hub</th><th className="pb-3">Date</th><th className="pb-3 text-right">Transactions</th><th className="pb-3 text-right">Revenue</th><th className="pb-3 text-right">Service fees</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.eventId}><td className="py-3 font-bold text-navy">{row.title}</td><td className="py-3 text-slate-500">{row.hub}</td><td className="py-3 text-slate-500">{row.date}</td><td className="py-3 text-right tabular-nums">{row.transactions}</td><td className="py-3 text-right font-bold tabular-nums text-navy">{formatPHP(row.revenue)}</td><td className="py-3 text-right tabular-nums text-primary">{formatPHP(row.serviceFees)}</td></tr>)}</tbody>
        </table>
      </div>
    );
  }

  const summaryColumns =
    "grid min-w-[1120px] grid-cols-[minmax(230px,1.5fr)_90px_repeat(5,minmax(120px,0.7fr))] items-center gap-4";

  return (
    <div className="mt-5 overflow-x-auto">
      <div className="min-w-[1120px]">
        <div className={`${summaryColumns} border-b border-slate-200 px-4 pb-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400`}>
          <span>Event</span><span className="text-right">Payments / spots</span><span className="text-right">Player checkout</span><span className="text-right">Venue revenue</span><span className="text-right">Gross fees</span><span className="text-right">PayMongo</span><span className="text-right">Net Bunal</span>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <details key={row.eventId} className="group">
              <summary className={`${summaryColumns} cursor-pointer list-none rounded-xl px-4 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden`}>
                <span className="min-w-0"><span className="flex items-center gap-2 font-bold text-navy"><span className="text-primary transition group-open:rotate-45">+</span><span className="truncate">{row.title}</span></span><span className="ml-5 mt-1 block truncate text-xs text-slate-500">{row.hub} · {row.date}</span></span>
                <span className="text-right tabular-nums text-slate-600">{row.transactions} / {row.paidSpots}</span>
                <span className="text-right font-semibold tabular-nums text-navy">{formatPHP(row.checkoutTotal)}</span>
                <span className="text-right font-semibold tabular-nums text-navy">{formatPHP(row.revenue)}</span>
                <span className="text-right tabular-nums text-slate-600">{formatPHP(row.grossPaymentFees)}</span>
                <span className="text-right tabular-nums text-red-600">{deduction(row.processingFees)}</span>
                <span className={`text-right font-black tabular-nums ${row.serviceFees < 0 ? "text-red-600" : "text-primary"}`}>{formatPHP(row.serviceFees)}</span>
              </summary>
              <div className="mb-4 ml-5 border-l-2 border-primary/15 pl-5">
                {row.payments.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-400"><th className="py-2">Payment</th><th className="py-2">Status</th><th className="py-2 text-right">Spots</th><th className="py-2 text-right">Player checkout</th><th className="py-2 text-right">Venue revenue</th><th className="py-2 text-right">Gross fees</th><th className="py-2 text-right">PayMongo</th><th className="py-2 text-right">Net Bunal</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{row.payments.map((payment) => <tr key={payment.paymentId}><td className="py-3"><span className="block font-mono font-semibold text-navy" title={payment.reference}>{paymentReference(payment.reference)}</span><span className="mt-0.5 block text-slate-400">{paymentDate(payment.paidAt)}</span></td><td className="py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${payment.status === "REFUNDED" ? "bg-red-50 text-red-600" : "bg-primary-soft text-primary"}`}>{payment.status}</span><span className="ml-1 text-[10px] text-slate-400">{payment.collectionMode}</span></td><td className="py-3 text-right tabular-nums">{payment.spots}</td><td className="py-3 text-right font-semibold tabular-nums text-navy">{formatPHP(payment.checkoutTotal)}</td><td className="py-3 text-right tabular-nums">{formatPHP(payment.venueRevenue)}</td><td className="py-3 text-right tabular-nums">{formatPHP(payment.grossPaymentFees)}</td><td className="py-3 text-right tabular-nums text-red-600">{deduction(payment.processingFees)}</td><td className={`py-3 text-right font-bold tabular-nums ${payment.netBunalRevenue < 0 ? "text-red-600" : "text-primary"}`}>{formatPHP(payment.netBunalRevenue)}</td></tr>)}</tbody>
                  </table>
                ) : (
                  <p className="py-4 text-xs text-slate-500">This event contains historical organizer fee adjustments without a checkout transaction.</p>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function CourtPaymentFeeBreakdown({
  action,
  audience,
  filters,
  rows,
  utilizationView,
  view,
}: {
  action: string;
  audience: "partner" | "owner";
  filters: BusinessAnalyticsFilters;
  rows: CourtPaymentBreakdownRow[];
  utilizationView: AnalyticsUtilizationView;
  view: AnalyticsBookingFeeView;
}) {
  const result = courtPaymentFeePage(rows, view);
  const preservedQuery = addAnalyticsUtilizationParams(
    analyticsSearchParams(filters),
    utilizationView
  );
  const filterFields = [...preservedQuery.entries()];
  const columns =
    "grid min-w-[1040px] grid-cols-[minmax(230px,1.4fr)_90px_repeat(5,minmax(120px,0.7fr))] items-center gap-4";

  const href = (page: number, reset = false) => {
    const query = addAnalyticsUtilizationParams(
      analyticsSearchParams(filters),
      utilizationView
    );
    if (!reset) addAnalyticsBookingFeeParams(query, view, page);
    return `${action}?${query.toString()}#court-fees`;
  };

  return (
    <section id="court-fees" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
      <SectionHeading
        eyebrow="Court payment audit"
        title="Bunal fee breakdown by checkout"
        description={
          audience === "owner"
            ? "Audit every court checkout by partner and hub, including the gross Bunal fee, absorbed PayMongo processing, and resulting net revenue."
            : "Each payment shows the player total, your complete court revenue, the gross Bunal fee, PayMongo processing absorbed by Bunal, and the resulting net fee included in settlement."
        }
      />
      <form
        action={action}
        method="get"
        className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-[#fbfcfb] p-3"
      >
        {filterFields.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="min-w-[220px] flex-1 lg:max-w-sm">
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Search payments
          </span>
          <input
            type="search"
            name="bookingFeeQuery"
            defaultValue={view.query}
            placeholder={
              audience === "owner"
                ? "Reference, partner, hub, or court"
                : "Reference, hub, or court"
            }
            className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Paid from
          </span>
          <input
            type="date"
            name="bookingFeeFrom"
            min={filters.from}
            max={filters.to}
            defaultValue={view.from}
            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Paid to
          </span>
          <input
            type="date"
            name="bookingFeeTo"
            min={filters.from}
            max={filters.to}
            defaultValue={view.to}
            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <button
          type="submit"
          className="min-h-9 rounded-lg bg-navy px-4 text-sm font-bold text-white transition hover:bg-navy/90"
        >
          Apply
        </button>
        <Link
          href={href(1, true)}
          className="inline-flex min-h-9 items-center px-2 text-xs font-bold text-slate-500 hover:text-navy"
        >
          Reset
        </Link>
      </form>
      {result.items.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={`${columns} border-b border-slate-200 px-4 pb-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400`}>
              <span>Payment</span><span className="text-right">Bookings</span><span className="text-right">Player checkout</span><span className="text-right">Court revenue</span><span className="text-right">Gross Bunal fee</span><span className="text-right">PayMongo</span><span className="text-right">Net Bunal fee</span>
            </div>
            <div className="divide-y divide-slate-100">
              {result.items.map((row) => (
                <details key={row.paymentId} className="group">
                  <summary className={`${columns} cursor-pointer list-none rounded-xl px-4 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden`}>
                    <span><span className="flex items-center gap-2"><span className="text-primary transition group-open:rotate-45">+</span><span className="font-mono font-semibold text-navy" title={row.reference}>{paymentReference(row.reference)}</span></span><span className="ml-5 mt-1 block truncate text-xs text-slate-400">{audience === "owner" ? `${row.partner} · ` : ""}{row.hub} · {paymentDate(row.paidAt)} · {row.collectionMode} · {row.status}</span></span>
                    <span className="text-right tabular-nums text-slate-600">{row.bookings.length}</span>
                    <span className="text-right font-semibold tabular-nums text-navy">{formatPHP(row.checkoutTotal)}</span>
                    <span className="text-right font-semibold tabular-nums text-navy">{formatPHP(row.venueRevenue)}</span>
                    <span className="text-right tabular-nums text-slate-600">{formatPHP(row.grossPaymentFees)}</span>
                    <span className="text-right tabular-nums text-red-600">{deduction(row.processingFees)}</span>
                    <span className={`text-right font-black tabular-nums ${row.netBunalRevenue < 0 ? "text-red-600" : "text-primary"}`}>{formatPHP(row.netBunalRevenue)}</span>
                  </summary>
                  <div className="mb-4 ml-5 border-l-2 border-primary/15 pl-5">
                    {row.bookings.length > 0 ? (
                      <table className="w-full text-xs"><thead><tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-400"><th className="py-2">Court</th><th className="py-2">Schedule</th><th className="py-2 text-right">Advertised subtotal</th></tr></thead><tbody className="divide-y divide-slate-100">{row.bookings.map((booking) => <tr key={booking.bookingId}><td className="py-3 font-semibold text-navy">{booking.court}</td><td className="py-3 text-slate-500">{formatManilaDateLong(booking.date)} · {formatSlotRange(booking.startHour, booking.endHour)}</td><td className="py-3 text-right font-semibold tabular-nums text-navy">{formatPHP(booking.venueRevenue)}</td></tr>)}</tbody></table>
                    ) : (
                      <p className="py-4 text-xs text-slate-500">The payment snapshot remains available, but its historical booking rows are no longer present.</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">No paid court checkouts match this search and date range.</div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">
          {result.total === 0
            ? "No payments to display"
            : `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total.toLocaleString()} payments`}
        </p>
        <div className="flex items-center gap-2">
          {result.page > 1 ? (
            <Link href={href(result.page - 1)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-navy transition hover:bg-slate-50">Previous</Link>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-bold text-slate-300">Previous</span>
          )}
          <span className="text-xs font-bold text-slate-500">Page {result.page} of {result.pageCount}</span>
          {result.page < result.pageCount ? (
            <Link href={href(result.page + 1)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-navy transition hover:bg-slate-50">Next</Link>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-bold text-slate-300">Next</span>
          )}
        </div>
      </div>
    </section>
  );
}

export function BusinessAnalyticsDashboard({
  action,
  audience,
  bookingFeeView,
  data,
  utilizationView,
}: {
  action: string;
  audience: "partner" | "owner";
  bookingFeeView: AnalyticsBookingFeeView;
  data: BusinessAnalyticsData;
  utilizationView: AnalyticsUtilizationView;
}) {
  const previous = data.previousKpis ?? undefined;
  const chartPoints: RevenuePoint[] = data.trend.map((point) => ({
    ...point,
    count: 0,
  }));
  const totalSource = Object.values(data.revenueBySource).reduce((sum, value) => sum + value, 0);

  return (
    <div className="mt-5 space-y-5">
      <nav aria-label="Analytics sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {[
          ["overview", "Overview"],
          ["courts", audience === "owner" ? "Venues" : "Courts"],
          ["court-fees", "Booking fees"],
          ["customers", "Customers"],
          ["events", "Events"],
          ...(audience === "owner" ? [["trainers", "Trainers"]] : []),
        ].map(([href, label], index) => (
          <a key={href} href={`#${href}`} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${index === 0 ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-navy"}`}>
            {label}
          </a>
        ))}
      </nav>

      <section id="overview" className="scroll-mt-24 space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <KpiCard
            primary
            label={audience === "owner" ? "Platform GMV" : "Net revenue"}
            value={formatPHP(audience === "owner" ? data.kpis.gross : data.kpis.netRevenue)}
            note={`${data.kpis.transactions} confirmed transactions`}
            delta={change(audience === "owner" ? data.kpis.gross : data.kpis.netRevenue, audience === "owner" ? previous?.gross : previous?.netRevenue)}
          />
          <KpiCard label="Net Bunal fees" value={formatPHP(data.kpis.serviceFees)} note="After player-checkout processing" delta={change(data.kpis.serviceFees, previous?.serviceFees)} />
          <KpiCard label={audience === "owner" ? "Venue & trainer shares" : "Gross revenue"} value={formatPHP(audience === "owner" ? data.kpis.recipientShare : data.kpis.salesRevenue)} note={`${formatPHP(data.kpis.refunds)} refunded`} delta={change(audience === "owner" ? data.kpis.recipientShare : data.kpis.salesRevenue, audience === "owner" ? previous?.recipientShare : previous?.salesRevenue)} />
          <KpiCard label={data.kpis.estimatedUtilization ? "Estimated utilization" : "Court utilization"} value={percent(data.kpis.utilizationRate)} note={data.kpis.estimatedUtilization ? "Pre-launch dates use current schedules" : "Confirmed court-hours ÷ available hours"} delta={null} />
          <KpiCard label="30-day retention" value={percent(data.kpis.retentionRate)} note={`${data.kpis.newCustomers} new purchasing customers`} delta={change(data.kpis.retentionRate, previous?.retentionRate)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_0.8fr]">
          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
            <SectionHeading eyebrow="Revenue trend" title="Collected revenue over time" description={`${data.filters.from} to ${data.filters.to} · refunds are recorded on the date issued.`} />
            <div className="mt-5">
              {chartPoints.some((point) => point.gross || point.refunds) ? (
                <RevenueChart points={chartPoints} id={`${audience}-business`} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">No confirmed payments match these filters.</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
            <SectionHeading eyebrow="Revenue mix" title="Where revenue comes from" description="Confirmed payments grouped by business line." />
            <div className="mt-6 space-y-5">
              {([
                ["Court bookings", data.revenueBySource.court, "bg-primary"],
                ["Events", data.revenueBySource.event, "bg-ocean"],
                ...(audience === "owner" ? [["Trainer sessions", data.revenueBySource.trainer, "bg-accent"]] : []),
              ] as [string, number, string][]).map(([label, value, tone]) => (
                <div key={label}>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-navy">{label}</span><span className="tabular-nums text-slate-500">{formatPHP(value)}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone}`} style={{ width: `${totalSource ? Math.max(2, value / totalSource * 100) : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <UtilizationReport
        action={action}
        audience={audience}
        bookingFeeView={bookingFeeView}
        filters={data.filters}
        rows={data.utilization}
        peakHours={data.peakHours}
        view={utilizationView}
      />

      <CourtPaymentFeeBreakdown
        action={action}
        audience={audience}
        filters={data.filters}
        rows={data.courtPayments}
        utilizationView={utilizationView}
        view={bookingFeeView}
      />

      <section id="customers" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
        <SectionHeading eyebrow="Customer intelligence" title="Growth and 30-day retention" description="A new customer completed their first purchase in this scope; retained customers purchased again within 30 days." />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Active customers", data.customers.active],
            ["New customers", data.customers.newCustomers],
            ["Returning customers", data.customers.returning],
            ["Retained in 30 days", data.customers.retainedWithin30Days],
            ["Retention rate", percent(data.customers.retentionRate)],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f7faf8] p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-navy">{value}</p></div>)}
        </div>
      </section>

      <section id="events" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
        <SectionHeading eyebrow="Event financial performance" title="Event revenue and payment fees" description={audience === "owner" ? "Expand an event to audit each checkout. Net Bunal revenue is the collected payment fee less PayMongo processing; settlement collection and other expenses are not allocated." : "Revenue and net Bunal fees after player-checkout processing. Settlement collection and other expenses are not allocated to individual events."} />
        <EventFinancialPerformance audience={audience} rows={data.events} />
      </section>

      {audience === "owner" ? <section id="trainers" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5"><SectionHeading eyebrow="Trainer intelligence" title="Trainer session performance" description="Confirmed trainer payments, trainer shares, and net Bunal fees after player-checkout processing." /><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400"><th className="pb-3">Trainer</th><th className="pb-3 text-right">Paid sessions</th><th className="pb-3 text-right">Trainer share</th><th className="pb-3 text-right">Bunal fees</th></tr></thead><tbody className="divide-y divide-slate-100">{data.trainers.map((row) => <tr key={row.trainerId}><td className="py-3 font-bold text-navy">{row.trainer}</td><td className="py-3 text-right tabular-nums">{row.sessions}</td><td className="py-3 text-right font-bold tabular-nums text-navy">{formatPHP(row.revenue)}</td><td className="py-3 text-right tabular-nums text-primary">{formatPHP(row.serviceFees)}</td></tr>)}{data.trainers.length === 0 ? <tr><td colSpan={4} className="py-10 text-center text-slate-500">No trainer payments match these filters.</td></tr> : null}</tbody></table></div></section> : null}
    </div>
  );
}
