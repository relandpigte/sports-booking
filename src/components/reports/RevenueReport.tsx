import type { ReactNode } from "react";

import type { RevenueSeries } from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";

import { RevenueChart } from "./RevenueChart";

export type StatTile = {
  label: string;
  value: string;
  hint?: string;
  // At most one tile should be emphasised — the number the page is about.
  emphasis?: boolean;
};

// The whole report panel: KPI row, chart, and the table underneath.
//
// Deliberately knows nothing about roles or hubs; callers supply the series and
// tiles.
export function RevenueReport({
  title,
  subtitle,
  series,
  tiles,
  empty,
  chartId,
}: {
  title: string;
  subtitle: string;
  series: RevenueSeries;
  tiles: StatTile[];
  // Shown instead of the chart when there is nothing to plot. Every caller
  // passes one that explains WHY it's empty — a flat zero with no explanation
  // reads as a broken page.
  empty: ReactNode;
  chartId: string;
}) {
  const hasMoney = series.totals.gross > 0 || series.totals.refunds > 0;

  // The busiest buckets, so the tooltip is never the only way to read a value.
  const top = [...series.points]
    .filter((p) => p.gross > 0 || p.refunds > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-2xl border p-4 ${
              tile.emphasis
                ? "border-primary/30 bg-primary-soft"
                : "border-gray-200"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-wide ${
                tile.emphasis ? "text-primary" : "text-gray-400"
              }`}
            >
              {tile.label}
            </p>
            {/* Not tabular-nums: on a large standalone figure equal-width
                digits read as a countdown. */}
            <p
              className={`mt-1 text-2xl font-bold ${
                tile.emphasis ? "text-primary" : "text-navy"
              }`}
            >
              {tile.value}
            </p>
            {tile.hint && (
              <p className="mt-0.5 text-xs text-gray-400">{tile.hint}</p>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-navy">{title}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>

        <div className="mt-4">
          {hasMoney ? (
            <RevenueChart points={series.points} id={chartId} />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-14 text-center">
              {empty}
            </div>
          )}
        </div>
      </section>

      {top.length > 0 && (
        <section className="rounded-2xl border border-gray-200 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-navy">
            {series.grain === "month" ? "By month" : "Busiest days"}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-md text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-2 font-semibold">
                    {series.grain === "month" ? "Month" : "Day"}
                  </th>
                  <th className="pb-2 text-right font-semibold">Payments</th>
                  <th className="pb-2 text-right font-semibold">Collected</th>
                  <th className="pb-2 text-right font-semibold">Refunded</th>
                  <th className="pb-2 text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {top.map((point) => (
                  <tr key={point.bucket}>
                    <td className="py-2 text-gray-900">{point.label}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">
                      {point.count}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-900">
                      {formatPHP(point.gross)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-500">
                      {point.refunds > 0 ? `−${formatPHP(point.refunds)}` : "—"}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-navy">
                      {formatPHP(point.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
