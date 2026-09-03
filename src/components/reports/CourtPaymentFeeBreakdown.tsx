"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { courtPaymentFeePage } from "@/lib/analytics-booking-fees";
import type { AnalyticsBookingFeeView } from "@/lib/analytics-query";
import type {
  BusinessAnalyticsFilters,
  CourtPaymentBreakdownRow,
} from "@/lib/business-analytics";
import { formatPHP } from "@/lib/currency";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

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

export function CourtPaymentFeeBreakdown({
  audience,
  filters,
  initialView,
  rows,
}: {
  audience: "partner" | "owner";
  filters: BusinessAnalyticsFilters;
  initialView: AnalyticsBookingFeeView;
  rows: CourtPaymentBreakdownRow[];
}) {
  const [view, setView] = useState(initialView);
  const userChangedView = useRef(false);
  const result = useMemo(() => courtPaymentFeePage(rows, view), [rows, view]);
  const columns =
    "grid min-w-[1040px] grid-cols-[minmax(230px,1.4fr)_90px_repeat(5,minmax(120px,0.7fr))] items-center gap-4";

  useEffect(() => {
    if (!userChangedView.current) return;
    const url = new URL(window.location.href);
    if (view.query) url.searchParams.set("bookingFeeQuery", view.query);
    else url.searchParams.delete("bookingFeeQuery");
    url.searchParams.set("bookingFeeFrom", view.from);
    url.searchParams.set("bookingFeeTo", view.to);
    if (result.page > 1) {
      url.searchParams.set("bookingFeePage", String(result.page));
    } else {
      url.searchParams.delete("bookingFeePage");
    }
    url.hash = "court-fees";
    window.history.replaceState(null, "", url);
  }, [result.page, view.from, view.query, view.to]);

  function updateView(next: AnalyticsBookingFeeView) {
    userChangedView.current = true;
    setView(next);
  }

  function reset() {
    updateView({
      page: 1,
      query: "",
      from: filters.from,
      to: filters.to,
    });
  }

  return (
    <section id="court-fees" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">
          Court payment audit
        </p>
        <h2 className="mt-1 text-lg font-black text-navy">
          Bunal fee breakdown by checkout
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {audience === "owner"
            ? "Audit every court checkout by partner and hub, including the gross Bunal fee, absorbed PayMongo processing, and resulting net revenue."
            : "Each payment shows the player total, your complete court revenue, the gross Bunal fee, PayMongo processing absorbed by Bunal, and the resulting net fee included in settlement."}
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-[#fbfcfb] p-3">
        <label className="min-w-[220px] flex-1 lg:max-w-sm">
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Search payments
          </span>
          <input
            type="search"
            name="bookingFeeQuery"
            value={view.query}
            onChange={(event) =>
              updateView({ ...view, page: 1, query: event.target.value })
            }
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
            value={view.from}
            onChange={(event) => {
              const from = event.target.value || filters.from;
              updateView({
                ...view,
                page: 1,
                from,
                to: from > view.to ? from : view.to,
              });
            }}
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
            value={view.to}
            onChange={(event) => {
              const to = event.target.value || filters.to;
              updateView({
                ...view,
                page: 1,
                from: to < view.from ? to : view.from,
                to,
              });
            }}
            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-9 items-center px-3 text-xs font-bold text-slate-500 hover:text-navy"
        >
          Reset
        </button>
        <p className="ml-auto pb-2 text-xs font-semibold text-slate-500" aria-live="polite">
          {result.total.toLocaleString()} {result.total === 1 ? "payment" : "payments"}
        </p>
      </div>
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
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => updateView({ ...view, page: result.page - 1 })}
            className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-navy transition hover:bg-slate-50 disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            Previous
          </button>
          <span className="text-xs font-bold text-slate-500">Page {result.page} of {result.pageCount}</span>
          <button
            type="button"
            disabled={result.page >= result.pageCount}
            onClick={() => updateView({ ...view, page: result.page + 1 })}
            className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-navy transition hover:bg-slate-50 disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
