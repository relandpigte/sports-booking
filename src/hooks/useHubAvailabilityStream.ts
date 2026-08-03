"use client";

import { useEffect, useMemo, useState } from "react";

export type CourtOccupancySnapshot = {
  courtId: string;
  date: string;
  bookedHours: number[];
  openPlayHours: number[];
};

export type HubAvailabilitySnapshot = {
  hubId: string;
  date: string;
  courts: CourtOccupancySnapshot[];
};

export function useHubAvailabilityStream(
  hubId: string,
  date: string,
  initial: HubAvailabilitySnapshot | null
): {
  occupancies: Map<string, CourtOccupancySnapshot> | null;
  live: boolean;
} {
  const [snapshot, setSnapshot] = useState<HubAvailabilitySnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(
      `/api/hubs/${hubId}/availability/stream?date=${date}`
    );
    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as HubAvailabilitySnapshot);
        setConnected(true);
      } catch {
        // Ignore a malformed frame; the next database poll sends a new one.
      }
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [hubId, date]);

  const current =
    snapshot?.hubId === hubId && snapshot.date === date
      ? snapshot
      : initial?.hubId === hubId && initial.date === date
        ? initial
        : null;
  const occupancies = useMemo(
    () =>
      current
        ? new Map(current.courts.map((court) => [court.courtId, court]))
        : null,
    [current]
  );

  return {
    occupancies,
    live:
      connected && snapshot?.hubId === hubId && snapshot.date === date,
  };
}
