"use client";

import { useRef, useState, type ReactNode } from "react";

import type { RevenuePoint } from "@/lib/analytics";
import { formatPHP } from "@/lib/currency";

// The hover layer: a crosshair and a tooltip over a chart that is already fully
// rendered underneath.
//
// The hit target is a full-height band per bucket, not the 8px dot — landing on
// a dot dead-centre is the classic unusable chart. The chart reads correctly
// with this component doing nothing at all, which is why the values are also in
// the axis and the table below.
export function ChartHover({
  points,
  coords,
  width,
  height,
  children,
}: {
  points: RevenuePoint[];
  coords: { x: number; y: number }[];
  width: number;
  height: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  function locate(clientX: number) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || points.length === 0) return;
    // The SVG scales to the container, so work in viewBox units.
    const x = ((clientX - box.left) / box.width) * width;
    let best = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].x - x) < Math.abs(coords[best].x - x)) best = i;
    }
    setActive(best);
  }

  const point = active != null ? points[active] : null;
  const at = active != null ? coords[active] : null;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseMove={(e) => locate(e.clientX)}
      onMouseLeave={() => setActive(null)}
      onTouchStart={(e) => locate(e.touches[0].clientX)}
      onTouchMove={(e) => locate(e.touches[0].clientX)}
    >
      {children}

      {point && at && (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="pointer-events-none absolute inset-0 h-auto w-full"
            aria-hidden
          >
            <line
              x1={at.x}
              y1={16}
              x2={at.x}
              y2={height - 28}
              stroke="var(--color-primary)"
              strokeWidth="1"
              strokeOpacity="0.35"
            />
            {point.net > 0 && (
              <circle
                cx={at.x}
                cy={at.y}
                r="5"
                fill="var(--color-primary)"
                stroke="white"
                strokeWidth="2"
              />
            )}
          </svg>

          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-navy px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{
              left: `${(at.x / width) * 100}%`,
              top: `${(at.y / height) * 100}%`,
            }}
          >
            <p className="font-semibold">{point.label}</p>
            <p className="text-white/80">{formatPHP(point.net)}</p>
            {point.refunds > 0 && (
              <p className="text-white/60">
                less {formatPHP(point.refunds)} refunded
              </p>
            )}
            <p className="text-white/60">
              {point.count} {point.count === 1 ? "payment" : "payments"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
