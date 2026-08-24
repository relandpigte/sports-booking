import type { RevenuePoint } from "@/lib/analytics";
import type { BusinessAnalyticsData } from "@/lib/business-analytics";
import { formatPHP } from "@/lib/currency";
import { formatHourLabel } from "@/lib/time";

import { RevenueChart } from "./RevenueChart";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

export function BusinessAnalyticsDashboard({
  audience,
  data,
}: {
  audience: "partner" | "owner";
  data: BusinessAnalyticsData;
}) {
  const previous = data.previousKpis ?? undefined;
  const chartPoints: RevenuePoint[] = data.trend.map((point) => ({
    ...point,
    count: 0,
  }));
  const totalSource = Object.values(data.revenueBySource).reduce((sum, value) => sum + value, 0);
  const maxPeak = Math.max(...data.peakHours.map((item) => item.bookedHours), 1);
  const hours = [...new Set(data.peakHours.map((item) => item.hour))].sort((a, b) => a - b);

  return (
    <div className="mt-5 space-y-5">
      <nav aria-label="Analytics sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {[
          ["overview", "Overview"],
          ["courts", audience === "owner" ? "Venues" : "Courts"],
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
          <KpiCard label="Bunal service fees" value={formatPHP(data.kpis.serviceFees)} note="3% fees recorded" delta={change(data.kpis.serviceFees, previous?.serviceFees)} />
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

      <section id="courts" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
        <SectionHeading eyebrow="Capacity intelligence" title={audience === "owner" ? "Venue and court utilization" : "Court utilization"} description="Confirmed booking and published-event court-hours divided by effective available court-hours." />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400"><th className="pb-3">Court</th><th className="pb-3">Hub</th><th className="pb-3">Sport</th><th className="pb-3 text-right">Booked</th><th className="pb-3 text-right">Available</th><th className="pb-3 pl-6">Utilization</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.utilization.map((row) => (
                <tr key={row.courtId}>
                  <td className="py-3 font-bold text-navy">{row.court}{row.estimated ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Estimated</span> : null}</td>
                  <td className="py-3 text-slate-500">{row.hub}</td><td className="py-3 capitalize text-slate-500">{row.sport}</td><td className="py-3 text-right tabular-nums text-navy">{row.bookedHours}h</td><td className="py-3 text-right tabular-nums text-slate-500">{row.availableHours}h</td>
                  <td className="py-3 pl-6"><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.utilizationRate)}%` }} /></div><span className="font-bold tabular-nums text-navy">{percent(row.utilizationRate)}</span></div></td>
                </tr>
              ))}
              {data.utilization.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">No courts match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>

        {hours.length > 0 ? <div className="mt-8 border-t border-slate-100 pt-6"><h3 className="font-black text-navy">Peak-hour analysis</h3><p className="mt-1 text-sm text-slate-500">Darker cells show more confirmed court-hours in Manila time.</p><div className="mt-4 overflow-x-auto"><div className="grid min-w-[720px] gap-1" style={{ gridTemplateColumns: `64px repeat(${hours.length}, minmax(34px, 1fr))` }}><div />{hours.map((hour) => <div key={hour} className="pb-1 text-center text-[10px] font-bold text-slate-400">{formatHourLabel(hour).replace(":00", "")}</div>)}{weekdays.flatMap((day, weekday) => [<div key={`${day}-label`} className="flex items-center text-xs font-bold text-slate-500">{day}</div>, ...hours.map((hour) => { const value = data.peakHours.find((item) => item.weekday === weekday && item.hour === hour)?.bookedHours ?? 0; return <div key={`${weekday}-${hour}`} title={`${day} ${formatHourLabel(hour)}: ${value} booked court-hours`} className="h-8 rounded-md border border-primary/10" style={{ backgroundColor: `rgb(27 142 77 / ${value ? 0.12 + value / maxPeak * 0.68 : 0.03})` }} />; })])}</div></div></div> : null}
      </section>

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
        <SectionHeading eyebrow="Event financial performance" title="Event revenue and service fees" description="Revenue and Bunal fees only. This is financial performance—not profit—because expenses are not tracked." />
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400"><th className="pb-3">Event</th><th className="pb-3">Hub</th><th className="pb-3">Date</th><th className="pb-3 text-right">Transactions</th><th className="pb-3 text-right">Revenue</th><th className="pb-3 text-right">Service fees</th></tr></thead><tbody className="divide-y divide-slate-100">{data.events.map((row) => <tr key={row.eventId}><td className="py-3 font-bold text-navy">{row.title}</td><td className="py-3 text-slate-500">{row.hub}</td><td className="py-3 text-slate-500">{row.date}</td><td className="py-3 text-right tabular-nums">{row.transactions}</td><td className="py-3 text-right font-bold tabular-nums text-navy">{formatPHP(row.revenue)}</td><td className="py-3 text-right tabular-nums text-primary">{formatPHP(row.serviceFees)}</td></tr>)}{data.events.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">No paid events match these filters.</td></tr> : null}</tbody></table></div>
      </section>

      {audience === "owner" ? <section id="trainers" className="scroll-mt-24 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5"><SectionHeading eyebrow="Trainer intelligence" title="Trainer session performance" description="Confirmed trainer payments, trainer shares, and Bunal service fees." /><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-400"><th className="pb-3">Trainer</th><th className="pb-3 text-right">Paid sessions</th><th className="pb-3 text-right">Trainer share</th><th className="pb-3 text-right">Bunal fees</th></tr></thead><tbody className="divide-y divide-slate-100">{data.trainers.map((row) => <tr key={row.trainerId}><td className="py-3 font-bold text-navy">{row.trainer}</td><td className="py-3 text-right tabular-nums">{row.sessions}</td><td className="py-3 text-right font-bold tabular-nums text-navy">{formatPHP(row.revenue)}</td><td className="py-3 text-right tabular-nums text-primary">{formatPHP(row.serviceFees)}</td></tr>)}{data.trainers.length === 0 ? <tr><td colSpan={4} className="py-10 text-center text-slate-500">No trainer payments match these filters.</td></tr> : null}</tbody></table></div></section> : null}
    </div>
  );
}
