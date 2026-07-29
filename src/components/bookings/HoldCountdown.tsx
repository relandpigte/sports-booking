"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The 15-minute hold, ticking down.
//
// The first value is computed on the SERVER and passed in: reading the clock
// during render is impure, and it also means the initial paint is right even
// before the effect runs.
export function HoldCountdown({
  expiresAt,
  initialSeconds,
}: {
  expiresAt: string;
  initialSeconds: number;
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
      <span className="text-sm font-medium text-red-600">Hold expired</span>
    );
  }

  return (
    <span
      className={`text-sm font-semibold tabular-nums ${
        left <= 60 ? "text-red-600" : "text-gray-900"
      }`}
      // Announced only as it gets urgent — a per-second live region is noise.
      aria-live={left <= 60 ? "polite" : "off"}
    >
      {mmss(left)} left
    </span>
  );
}
