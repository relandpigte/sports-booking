"use client";

import { useNow } from "@/hooks/useNow";

// Minutes and seconds since the match started, e.g. 12:05 or 95:40. It ticks
// in its own component so only the timer re-renders each second.
export function MatchTimer({ startedAt }: { startedAt: string }) {
  const now = useNow(1_000);
  if (now === null) return null;
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return (
    <span
      className="font-mono text-sm font-black tabular-nums text-navy"
      aria-label={`Playing for ${Math.floor(total / 60)} minutes`}
    >
      {Math.floor(total / 60)}:{String(total % 60).padStart(2, "0")}
    </span>
  );
}
