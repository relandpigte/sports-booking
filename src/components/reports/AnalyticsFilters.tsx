import { analyticsSearchParams } from "@/lib/analytics-query";
import type {
  AnalyticsFilterOptions,
  BusinessAnalyticsFilters,
} from "@/lib/business-analytics";
import { GAME_LABELS } from "@/lib/constants";

const control =
  "min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export function AnalyticsFilters({
  action,
  audience,
  filters,
  options,
}: {
  action: string;
  audience: "partner" | "owner";
  filters: BusinessAnalyticsFilters;
  options: AnalyticsFilterOptions;
}) {
  const exportQuery = analyticsSearchParams(filters);
  exportQuery.set("audience", audience);
  const hubs = options.hubs.filter(
    (hub) => !filters.partnerId || hub.partnerId === filters.partnerId
  );
  const courts = options.courts.filter(
    (court) => !filters.hubId || court.hubId === filters.hubId
  );

  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5">
      <form action={action} method="get" className="grid gap-3 xl:grid-cols-[repeat(8,minmax(0,1fr))_auto]">
        <label className="text-xs font-bold text-slate-500">
          From
          <input className={`${control} mt-1 w-full`} type="date" name="from" defaultValue={filters.from} />
        </label>
        <label className="text-xs font-bold text-slate-500">
          To
          <input className={`${control} mt-1 w-full`} type="date" name="to" defaultValue={filters.to} />
        </label>
        {audience === "owner" ? (
          <label className="text-xs font-bold text-slate-500">
            Partner
            <select className={`${control} mt-1 w-full`} name="partner" defaultValue={filters.partnerId ?? ""}>
              <option value="">All partners</option>
              {options.partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="text-xs font-bold text-slate-500">
          Hub
          <select className={`${control} mt-1 w-full`} name="hub" defaultValue={filters.hubId ?? ""}>
            <option value="">All hubs</option>
            {hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          Court
          <select className={`${control} mt-1 w-full`} name="court" defaultValue={filters.courtId ?? ""}>
            <option value="">All courts</option>
            {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          Sport
          <select className={`${control} mt-1 w-full`} name="sport" defaultValue={filters.sport ?? ""}>
            <option value="">All sports</option>
            {options.sports.map((sport) => <option key={sport} value={sport}>{GAME_LABELS[sport] ?? sport}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          Revenue source
          <select className={`${control} mt-1 w-full`} name="source" defaultValue={filters.source}>
            <option value="all">All revenue</option>
            <option value="court">Court bookings</option>
            <option value="event">Events</option>
            {audience === "owner" ? <option value="trainer">Trainer sessions</option> : null}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          Payment mode
          <select className={`${control} mt-1 w-full`} name="mode" defaultValue={filters.mode}>
            <option value="all">All modes</option>
            <option value="AUTOMATIC">Automatic</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          Comparison
          <select className={`${control} mt-1 w-full`} name="compare" defaultValue={filters.compare ? "1" : "0"}>
            <option value="1">Previous period</option>
            <option value="0">No comparison</option>
          </select>
        </label>
        <div className="flex items-end gap-2 xl:col-span-full xl:justify-end">
          <a
            href={`/api/analytics/export?${exportQuery.toString()}`}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-navy transition hover:border-primary/40 hover:bg-primary-soft"
          >
            Export CSV
          </a>
          <button type="submit" className="min-h-10 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition hover:bg-primary-hover">
            Apply filters
          </button>
        </div>
      </form>
    </section>
  );
}
