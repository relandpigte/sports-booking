import Link from "next/link";

import type { AnalyticsKpis } from "@/lib/business-analytics";
import { formatPHP } from "@/lib/currency";

export function AnalyticsHomeSummary({
  audience,
  kpis,
}: {
  audience: "partner" | "owner";
  kpis: AnalyticsKpis;
}) {
  const href =
    audience === "owner" ? "/dashboard/admin/reports" : "/dashboard/reports";
  const cards = [
    {
      label: audience === "owner" ? "Platform GMV" : "Net revenue",
      value: formatPHP(audience === "owner" ? kpis.gross : kpis.netRevenue),
    },
    { label: "Bunal fees", value: formatPHP(kpis.serviceFees) },
    {
      label: kpis.estimatedUtilization
        ? "Estimated utilization"
        : "Court utilization",
      value: `${kpis.utilizationRate.toFixed(1)}%`,
    },
    { label: "30-day retention", value: `${kpis.retentionRate.toFixed(1)}%` },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            Last 30 days
          </p>
          <h2 className="mt-1 text-lg font-black text-navy">
            Business snapshot
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Revenue, capacity, and customer health at a glance.
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-10 items-center rounded-xl bg-navy px-4 text-sm font-bold text-white transition hover:bg-navy/90"
        >
          Open analytics →
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-[#f7faf8] p-4">
            <p className="text-xs font-bold text-slate-500">{card.label}</p>
            <p className="mt-2 text-xl font-black text-navy">{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
