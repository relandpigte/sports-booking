import Link from "next/link";
import { Fragment } from "react";

import {
  analyticsSearchParams,
  type AnalyticsUtilizationView,
} from "@/lib/analytics-query";
import { hubUtilizationPage } from "@/lib/analytics-utilization";
import type {
  BusinessAnalyticsFilters,
  UtilizationRow,
} from "@/lib/business-analytics";
import { formatHourLabel } from "@/lib/time";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function utilizationHref(args: {
  action: string;
  filters: BusinessAnalyticsFilters;
  view: AnalyticsUtilizationView;
  page?: number;
  expandedHubId?: string;
}) {
  const query = analyticsSearchParams(args.filters);
  if (args.view.query) query.set("utilizationQuery", args.view.query);
  if (args.view.sort !== "utilization-desc") {
    query.set("utilizationSort", args.view.sort);
  }
  if (args.page && args.page > 1) {
    query.set("utilizationPage", String(args.page));
  }
  if (args.expandedHubId) {
    query.set("utilizationHub", args.expandedHubId);
  }
  return `${args.action}?${query.toString()}#courts`;
}

function UtilizationBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="min-w-12 font-bold tabular-nums text-navy">
        {percent(value)}
      </span>
    </div>
  );
}

function CourtTable({ rows }: { rows: UtilizationRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
            <th className="pb-3">Court</th>
            <th className="pb-3">Hub</th>
            <th className="pb-3">Sport</th>
            <th className="pb-3 text-right">Booked</th>
            <th className="pb-3 text-right">Available</th>
            <th className="pb-3 pl-6">Utilization</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.courtId}>
              <td className="py-3 font-bold text-navy">
                {row.court}
                {row.estimated ? (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    Estimated
                  </span>
                ) : null}
              </td>
              <td className="py-3 text-slate-500">{row.hub}</td>
              <td className="py-3 capitalize text-slate-500">{row.sport}</td>
              <td className="py-3 text-right tabular-nums text-navy">
                {row.bookedHours}h
              </td>
              <td className="py-3 text-right tabular-nums text-slate-500">
                {row.availableHours}h
              </td>
              <td className="py-3 pl-6">
                <UtilizationBar value={row.utilizationRate} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-slate-500">
                No courts match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function OwnerHubTable({
  action,
  filters,
  rows,
  view,
}: {
  action: string;
  filters: BusinessAnalyticsFilters;
  rows: UtilizationRow[];
  view: AnalyticsUtilizationView;
}) {
  const result = hubUtilizationPage(rows, view);
  const filterFields = [...analyticsSearchParams(filters).entries()];

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <form
        action={action}
        method="get"
        className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-[#fbfcfb] p-3"
      >
        {filterFields.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="min-w-[220px] flex-1 lg:max-w-sm">
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Find a hub or partner
          </span>
          <input
            type="search"
            name="utilizationQuery"
            defaultValue={view.query}
            placeholder="Search hubs or partners"
            className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <label className="min-w-[180px]">
          <span className="mb-1 block text-[11px] font-bold text-slate-500">
            Sort by
          </span>
          <select
            name="utilizationSort"
            defaultValue={view.sort}
            className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="utilization-desc">Highest utilization</option>
            <option value="booked-desc">Most booked hours</option>
            <option value="name-asc">Hub name</option>
          </select>
        </label>
        <button
          type="submit"
          className="min-h-9 rounded-lg bg-navy px-4 text-sm font-bold text-white transition hover:bg-navy/90"
        >
          Apply
        </button>
        <p className="ml-auto pb-2 text-xs font-semibold text-slate-500">
          {result.total.toLocaleString()} {result.total === 1 ? "hub" : "hubs"}
        </p>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-white text-left text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
              <th className="w-12 px-3 py-3">
                <span className="sr-only">Details</span>
              </th>
              <th className="py-3 pr-3">Hub</th>
              <th className="py-3 pr-3">Partner</th>
              <th className="py-3 pr-3">Courts</th>
              <th className="py-3 pr-3">Sports</th>
              <th className="py-3 pr-3 text-right">Booked</th>
              <th className="py-3 pr-3 text-right">Available</th>
              <th className="py-3 pr-4">Utilization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {result.items.map((hub) => {
              const expanded = view.expandedHubId === hub.hubId;
              const detailsHref = utilizationHref({
                action,
                filters,
                view,
                page: result.page,
                expandedHubId: expanded ? undefined : hub.hubId,
              });
              return (
                <Fragment key={hub.hubId}>
                  <tr className={expanded ? "bg-primary-soft/35" : undefined}>
                    <td className="px-3 py-3 align-top">
                      <Link
                        href={detailsHref}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} courts for ${hub.hub}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-black text-primary transition hover:border-primary/40 hover:bg-primary-soft"
                      >
                        {expanded ? "−" : "+"}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <Link href={detailsHref} className="font-bold text-navy hover:text-primary">
                        {hub.hub}
                      </Link>
                      {hub.estimated ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Estimated
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 align-top text-slate-500">
                      {hub.partner}
                    </td>
                    <td className="py-3 pr-3 align-top tabular-nums text-navy">
                      {hub.courtCount}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {hub.sports.slice(0, 3).map((sport) => (
                          <span
                            key={sport}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold capitalize text-slate-600"
                          >
                            {sport}
                          </span>
                        ))}
                        {hub.sports.length > 3 ? (
                          <span className="text-[10px] font-bold text-slate-500">
                            +{hub.sports.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right align-top tabular-nums text-navy">
                      {hub.bookedHours}h
                    </td>
                    <td className="py-3 pr-3 text-right align-top tabular-nums text-slate-500">
                      {hub.availableHours}h
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <UtilizationBar value={hub.utilizationRate} />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td colSpan={8} className="bg-[#f8faf9] px-5 py-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                              Court details
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {hub.courtCount} {hub.courtCount === 1 ? "court" : "courts"} at {hub.hub}
                            </p>
                          </div>
                          <Link
                            href={detailsHref}
                            className="text-xs font-bold text-slate-500 hover:text-navy"
                          >
                            Close details
                          </Link>
                        </div>
                        <CourtTable rows={hub.courts} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  No hubs match this search and filter combination.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-xs text-slate-500">
          {result.total === 0
            ? "No hubs to display"
            : `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total.toLocaleString()} hubs`}
        </p>
        <div className="flex items-center gap-2">
          {result.page > 1 ? (
            <Link
              href={utilizationHref({
                action,
                filters,
                view,
                page: result.page - 1,
              })}
              className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-navy transition hover:bg-slate-50"
            >
              Previous
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-bold text-slate-300">
              Previous
            </span>
          )}
          <span className="text-xs font-bold text-slate-500">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={utilizationHref({
                action,
                filters,
                view,
                page: result.page + 1,
              })}
              className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-navy transition hover:bg-slate-50"
            >
              Next
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-bold text-slate-300">
              Next
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PeakHours({
  peakHours,
}: {
  peakHours: { weekday: number; hour: number; bookedHours: number }[];
}) {
  const maxPeak = Math.max(...peakHours.map((item) => item.bookedHours), 1);
  const hours = [...new Set(peakHours.map((item) => item.hour))].sort(
    (a, b) => a - b
  );
  if (hours.length === 0) return null;

  return (
    <div className="mt-8 border-t border-slate-100 pt-6">
      <h3 className="font-black text-navy">Peak-hour analysis</h3>
      <p className="mt-1 text-sm text-slate-500">
        Darker cells show more confirmed court-hours in Manila time.
      </p>
      <div className="mt-4 overflow-x-auto">
        <div
          className="grid min-w-[720px] gap-1"
          style={{
            gridTemplateColumns: `64px repeat(${hours.length}, minmax(34px, 1fr))`,
          }}
        >
          <div />
          {hours.map((hour) => (
            <div
              key={hour}
              className="pb-1 text-center text-[10px] font-bold text-slate-400"
            >
              {formatHourLabel(hour).replace(":00", "")}
            </div>
          ))}
          {weekdays.flatMap((day, weekday) => [
            <div
              key={`${day}-label`}
              className="flex items-center text-xs font-bold text-slate-500"
            >
              {day}
            </div>,
            ...hours.map((hour) => {
              const value =
                peakHours.find(
                  (item) => item.weekday === weekday && item.hour === hour
                )?.bookedHours ?? 0;
              return (
                <div
                  key={`${weekday}-${hour}`}
                  title={`${day} ${formatHourLabel(hour)}: ${value} booked court-hours`}
                  className="h-8 rounded-md border border-primary/10"
                  style={{
                    backgroundColor: `rgb(27 142 77 / ${value ? 0.12 + (value / maxPeak) * 0.68 : 0.03})`,
                  }}
                />
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}

export function UtilizationReport({
  action,
  audience,
  filters,
  rows,
  peakHours,
  view,
}: {
  action: string;
  audience: "partner" | "owner";
  filters: BusinessAnalyticsFilters;
  rows: UtilizationRow[];
  peakHours: { weekday: number; hour: number; bookedHours: number }[];
  view: AnalyticsUtilizationView;
}) {
  return (
    <section
      id="courts"
      className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5"
    >
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">
          Capacity intelligence
        </p>
        <h2 className="mt-1 text-lg font-black text-navy">
          {audience === "owner"
            ? "Venue and court utilization"
            : "Court utilization"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Confirmed booking and published-event court-hours divided by effective
          available court-hours.
        </p>
      </div>
      {audience === "owner" ? (
        <OwnerHubTable
          action={action}
          filters={filters}
          rows={rows}
          view={view}
        />
      ) : (
        <div className="mt-5">
          <CourtTable rows={rows} />
        </div>
      )}
      <PeakHours peakHours={peakHours} />
    </section>
  );
}
