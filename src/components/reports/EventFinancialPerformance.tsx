"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  eventPerformanceDateRange,
  eventPerformancePage,
} from "@/lib/analytics-events";
import type { AnalyticsEventView } from "@/lib/analytics-query";
import type { EventPerformanceRow } from "@/lib/business-analytics";
import { formatPHP } from "@/lib/currency";

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

export function EventFinancialPerformance({
  audience,
  initialView,
  rows,
}: {
  audience: "partner" | "owner";
  initialView: AnalyticsEventView;
  rows: EventPerformanceRow[];
}) {
  const [view, setView] = useState(initialView);
  const userChangedView = useRef(false);
  const dateRange = useMemo(
    () => eventPerformanceDateRange(rows, initialView),
    [initialView, rows]
  );
  const result = useMemo(() => eventPerformancePage(rows, view), [rows, view]);

  useEffect(() => {
    if (!userChangedView.current) return;
    const url = new URL(window.location.href);
    if (view.query) url.searchParams.set("eventQuery", view.query);
    else url.searchParams.delete("eventQuery");
    url.searchParams.set("eventFrom", view.from);
    url.searchParams.set("eventTo", view.to);
    if (result.page > 1) {
      url.searchParams.set("eventPage", String(result.page));
    } else {
      url.searchParams.delete("eventPage");
    }
    url.hash = "events";
    window.history.replaceState(null, "", url);
  }, [result.page, view.from, view.query, view.to]);

  function updateView(next: AnalyticsEventView) {
    userChangedView.current = true;
    setView(next);
  }

  function reset() {
    updateView({ page: 1, query: "", ...dateRange });
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-[#fbfcfb] p-3">
        <label className="min-w-[220px] flex-1 lg:max-w-sm">
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Search events
          </span>
          <input
            type="search"
            name="eventQuery"
            value={view.query}
            onChange={(event) =>
              updateView({ ...view, page: 1, query: event.target.value })
            }
            placeholder="Event, hub, or payment reference"
            className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Event from
          </span>
          <input
            type="date"
            name="eventFrom"
            min={dateRange.from}
            max={dateRange.to}
            value={view.from}
            onChange={(event) => {
              const from = event.target.value || dateRange.from;
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
            Event to
          </span>
          <input
            type="date"
            name="eventTo"
            min={dateRange.from}
            max={dateRange.to}
            value={view.to}
            onChange={(event) => {
              const to = event.target.value || dateRange.to;
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
          {result.total.toLocaleString()} {result.total === 1 ? "event" : "events"}
        </p>
      </div>

      <EventRows audience={audience} rows={result.items} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">
          {result.total === 0
            ? "No events to display"
            : `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total.toLocaleString()} events`}
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
          <span className="text-xs font-bold text-slate-500">
            Page {result.page} of {result.pageCount}
          </span>
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
    </>
  );
}

function EventRows({
  audience,
  rows,
}: {
  audience: "partner" | "owner";
  rows: EventPerformanceRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
        No paid events match this search and date range.
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
