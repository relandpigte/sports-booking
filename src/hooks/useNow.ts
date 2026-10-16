"use client";

import { useEffect, useState } from "react";

// The current time, refreshed on an interval after mount. It starts null so
// server and client render the same markup.
export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [intervalMs]);
  return now;
}
