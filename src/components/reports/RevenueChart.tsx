import type { RevenuePoint } from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";

import { ChartHover } from "./ChartHover";

// A single series over time, so: an area with its line, in one hue, and no
// legend — the card's title says what is plotted.
//
// Rendered as SVG on the SERVER. It arrives with the page, prints, survives a
// failed hydration, and costs nothing in the bundle. The only client code is
// the hover layer sitting on top.

const W = 760;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// Round the axis up to something a person would say out loud, so the gridlines
// land on readable numbers rather than 1,733.
function niceCeiling(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

// Peso axis labels stay short: 2500 -> "₱2.5k".
function axisMoney(value: number): string {
  if (value === 0) return "₱0";
  if (value >= 1000) {
    const k = value / 1000;
    return `₱${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `₱${value}`;
}

// Monotone cubic, not a plain bezier.
//
// A smooth curve through daily totals must never invent a value that isn't
// possible — a Catmull-Rom through 0, 2500, 0 dips BELOW zero between points,
// drawing negative revenue that never happened. This clamps every tangent to
// the direction of its neighbours, so the curve stays inside the data.
function monotonePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x));
  }

  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    // A sign change means this point is a local extreme: flatten, don't
    // overshoot past it.
    tangent.push(
      slope[i - 1] * slope[i] <= 0
        ? 0
        : (2 * slope[i - 1] * slope[i]) / (slope[i - 1] + slope[i])
    );
  }
  tangent.push(slope[n - 2]);

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    d +=
      ` C ${points[i].x + third},${points[i].y + tangent[i] * third}` +
      ` ${points[i + 1].x - third},${points[i + 1].y - tangent[i + 1] * third}` +
      ` ${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

export function RevenueChart({
  points,
  id = "revenue",
}: {
  points: RevenuePoint[];
  // Unique per chart on the page: SVG gradient ids are global.
  id?: string;
}) {
  const max = niceCeiling(Math.max(...points.map((p) => p.net), 0));
  const step = points.length > 1 ? PLOT_W / (points.length - 1) : 0;

  const xy = points.map((point, i) => ({
    x: PAD.left + (points.length > 1 ? i * step : PLOT_W / 2),
    // Clamped at zero: a net-negative day (refunds beyond takings) sits on the
    // baseline rather than escaping the plot.
    y: PAD.top + PLOT_H - (Math.max(0, point.net) / max) * PLOT_H,
  }));

  const line = monotonePath(xy);
  const area =
    xy.length > 0
      ? `${line} L ${xy[xy.length - 1].x},${PAD.top + PLOT_H} L ${xy[0].x},${PAD.top + PLOT_H} Z`
      : "";

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);

  // Enough x labels to orient, never so many they collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  // The peak, direct-labelled. One label, on the point the reader is looking
  // for — not a number on every dot.
  const peakIndex = points.reduce(
    (best, p, i) => (p.net > points[best].net ? i : best),
    0
  );
  const peak = points[peakIndex];

  return (
    <ChartHover points={points} width={W} height={H} coords={xy}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Revenue by ${points.length > 31 ? "month" : "day"}, peak ${formatPHP(peak?.net ?? 0)} on ${peak?.label ?? "—"}`}
      >
        <defs>
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
            {/* A wash, never a saturated block. */}
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Gridlines: hairline, solid, one step off the surface. */}
        {gridValues.map((value, i) => {
          const y = PAD.top + PLOT_H - (value / max) * PLOT_H;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-400"
                fontSize="11"
              >
                {axisMoney(value)}
              </text>
            </g>
          );
        })}

        {area && <path d={area} fill={`url(#${id}-fade)`} />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Markers only where there's money: a dot on every zero day is noise.
            Each carries a surface ring so it stays legible over the line. */}
        {xy.map((p, i) =>
          points[i].net > 0 ? (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4"
              fill="var(--color-primary)"
              stroke="white"
              strokeWidth="2"
            />
          ) : null
        )}

        {/* The x-axis band lives INSIDE the viewBox — a container that crops it
            is one of the classic chart bugs. */}
        {points.map((point, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={point.bucket}
              x={xy[i].x}
              y={H - 8}
              textAnchor={
                i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
              }
              className="fill-gray-400"
              fontSize="11"
            >
              {point.label}
            </text>
          ) : null
        )}

        {peak && peak.net > 0 && (
          <text
            x={Math.min(Math.max(xy[peakIndex].x, PAD.left + 24), W - PAD.right - 24)}
            y={Math.max(xy[peakIndex].y - 12, PAD.top + 10)}
            textAnchor="middle"
            className="fill-gray-900"
            fontSize="11"
            fontWeight="600"
          >
            {formatPHP(peak.net)}
          </text>
        )}
      </svg>
    </ChartHover>
  );
}
