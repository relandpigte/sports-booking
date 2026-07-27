"use client";

import { useEffect, useState } from "react";

type Snapshot = { courtId: string; date: string; bookedHours: number[] };

// Subscribes to a court's live availability for one date.
//
// The stream sends a snapshot immediately on connect, so it doubles as the
// loader when the player switches court or date — there's no separate fetch.
// `bookedHours` is null until data for the *current* selection is available,
// which the grid renders as a loading state.
export function useAvailabilityStream(
  courtId: string | null,
  date: string,
  initial: Snapshot | null
): { bookedHours: number[] | null; live: boolean } {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!courtId) return;

    const source = new EventSource(
      `/api/courts/${courtId}/availability/stream?date=${date}`
    );

    source.onopen = () => setConnected(true);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Snapshot;
        setSnapshot(data);
        setConnected(true);
      } catch {
        // Ignore a malformed frame; the next tick resends.
      }
    };

    // EventSource retries on its own; just reflect that we're not live.
    source.onerror = () => setConnected(false);

    return () => source.close();
  }, [courtId, date]);

  // Match both sources against the current selection rather than resetting
  // state in an effect — a late frame from a previous court/date is simply
  // ignored, and switching selection falls back to "loading" on its own.
  const matches = (s: Snapshot | null) =>
    s != null && s.courtId === courtId && s.date === date;

  const streamed = matches(snapshot) ? snapshot!.bookedHours : null;
  // The server-rendered snapshot covers the first paint, before the stream
  // has delivered anything.
  const fallback = matches(initial) ? initial!.bookedHours : null;

  return {
    bookedHours: streamed ?? fallback,
    live: connected && streamed !== null,
  };
}
