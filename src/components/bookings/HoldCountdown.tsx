"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The checkout hold, ticking down.
//
// The first value is computed on the SERVER and passed in: reading the clock
// during render is impure, and it also means the initial paint is right even
// before the effect runs.
export function HoldCountdown({
  expiresAt,
  initialSeconds,
  tone = "light",
}: {
  expiresAt: string;
  initialSeconds: number;
  tone?: "light" | "dark";
}) {
  const [left, setLeft] = useState(initialSeconds);
  const router = useRouter();

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // The moment it lapses, re-render from the server so the page switches to
  // its expired state rather than sitting on a dead form.
  useEffect(() => {
    if (left === 0) router.refresh();
  }, [left, router]);

  if (left === 0) {
    return (
      <span
        className={`inline-flex shrink-0 rounded-xl border px-3 py-2 text-sm font-bold ${
          tone === "dark"
            ? "border-red-300/30 bg-red-500/20 text-red-100"
            : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        Hold expired
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-baseline gap-2 rounded-xl border px-3 py-2 ${
        left <= 60
          ? tone === "dark"
            ? "border-red-300/30 bg-red-500/20 text-red-100"
            : "border-red-200 bg-red-50 text-red-700"
          : tone === "dark"
            ? "border-white/15 bg-white/10 text-white"
            : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
      // Announced only as it gets urgent — a per-second live region is noise.
      aria-live={left <= 60 ? "polite" : "off"}
    >
      <span
        className={`text-[10px] font-black uppercase tracking-[0.14em] ${
          left <= 60
            ? "text-inherit"
            : tone === "dark"
              ? "text-white/60"
              : "text-amber-700"
        }`}
      >
        Spot held
      </span>
      <span className="text-sm font-black tabular-nums">{mmss(left)}</span>
    </span>
  );
}
