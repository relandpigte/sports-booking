// The chart's geometry, by rendering it to markup and reading the SVG back.
//
// The drawing code is where a revenue chart lies: a smooth curve that dips
// below zero, a label that falls outside the viewBox, an axis band cropped off
// the bottom. None of that is visible in a type check.
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { RevenueChart } from "@/components/reports/RevenueChart";
import type { RevenuePoint } from "@/lib/analytics";

import { ok, run } from "./harness";


const H = 260;
const PLOT_TOP = 16;
const BASELINE = H - 28; // PAD.top + PLOT_H

function point(bucket: string, net: number, count = 1): RevenuePoint {
  return {
    bucket,
    label: bucket.slice(5),
    gross: Math.max(net, 0),
    refunds: net < 0 ? -net : 0,
    net,
    count,
  };
}

function render(points: RevenuePoint[]): string {
  return renderToStaticMarkup(
    React.createElement(RevenueChart, { points, id: "t" })
  );
}

// Every y coordinate in a path, whatever command it belongs to.
function pathYs(markup: string): number[] {
  const out: number[] = [];
  for (const d of markup.matchAll(/ d="([^"]+)"/g)) {
    for (const pair of d[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      out.push(Number(pair[2]));
    }
  }
  return out;
}

async function main() {
  // --- The overshoot case ---------------------------------------------------
  // A spike between two zeros is exactly where a naive bezier draws negative
  // revenue on its way in and out.
  const spike = [
    point("2026-07-01", 0, 0),
    point("2026-07-02", 0, 0),
    point("2026-07-03", 2500),
    point("2026-07-04", 0, 0),
    point("2026-07-05", 0, 0),
  ];
  const spikeSvg = render(spike);
  const ys = pathYs(spikeSvg);
  ok("the spike renders a path", ys.length > 0);
  ok(
    "the curve never dips below the baseline",
    ys.every((y) => y <= BASELINE + 0.01)
  );
  ok(
    "and never escapes above the plot",
    ys.every((y) => y >= PLOT_TOP - 0.01)
  );

  // --- A net-negative bucket ------------------------------------------------
  // More refunded than taken. It must sit ON the baseline, not off-canvas.
  const negative = [
    point("2026-07-01", 1000),
    point("2026-07-02", -800),
    point("2026-07-03", 500),
  ];
  const negSvg = render(negative);
  ok(
    "a net-negative day is clamped to the baseline",
    pathYs(negSvg).every((y) => y <= BASELINE + 0.01 && y >= PLOT_TOP - 0.01)
  );

  // --- Marks ----------------------------------------------------------------
  const circles = (svg: string) => (svg.match(/<circle/g) ?? []).length;
  ok("a marker for each day with money", circles(spikeSvg) === 1);
  ok(
    "no markers on zero days",
    circles(render([point("2026-07-01", 0, 0), point("2026-07-02", 0, 0)])) === 0
  );
  ok("the line is 2px", spikeSvg.includes('stroke-width="2"'));
  ok(
    "gridlines are solid, never dashed",
    !spikeSvg.includes("stroke-dasharray")
  );
  ok("five gridlines", (spikeSvg.match(/stroke="#e5e7eb"/g) ?? []).length === 5);
  ok(
    "the area is a wash, not a block",
    spikeSvg.includes('stop-opacity="0.16"')
  );

  // --- Labels ---------------------------------------------------------------
  const month = Array.from({ length: 31 }, (_, i) =>
    point(`2026-07-${String(i + 1).padStart(2, "0")}`, (i % 5) * 300)
  );
  const monthSvg = render(month);
  const labels = (monthSvg.match(/font-size="11"/g) ?? []).length;
  ok("a full month doesn't label every day", labels < 31);
  ok(
    "exactly one value is direct-labelled",
    (monthSvg.match(/font-weight="600"/g) ?? []).length === 1
  );
  ok(
    "the peak label names the peak",
    monthSvg.includes("₱1,200.00") || monthSvg.includes("1,200")
  );

  // Everything the browser draws has to be inside the viewBox.
  const texts = [...monthSvg.matchAll(/<text[^>]*y="([\d.]+)"/g)].map((m) =>
    Number(m[1])
  );
  ok(
    "every label sits inside the viewBox",
    texts.every((y) => y >= 0 && y <= H)
  );
  ok(
    "the x-axis band is inside it too",
    texts.some((y) => y > BASELINE && y <= H)
  );

  // --- Degenerate inputs ----------------------------------------------------
  ok("a single point renders", render([point("2026-07-01", 500)]).includes("<svg"));
  ok(
    "an all-zero month renders without NaN",
    !render(
      Array.from({ length: 30 }, (_, i) =>
        point(`2026-07-${String(i + 1).padStart(2, "0")}`, 0, 0)
      )
    ).includes("NaN")
  );
  ok("no NaN anywhere in the spike", !spikeSvg.includes("NaN"));

  // --- Accessibility --------------------------------------------------------
  ok('the chart has role="img"', spikeSvg.includes('role="img"'));
  ok(
    "with a label naming the peak",
    /aria-label="Revenue by day, peak ₱2,500.00 on 07-03"/.test(spikeSvg)
  );

}

void run(main);
