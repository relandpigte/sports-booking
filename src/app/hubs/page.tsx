import type { Metadata } from "next";

import { PageShell } from "@/components/PageShell";
import {
  HubDirectory,
  type DirectoryHubView,
} from "@/components/hubs/HubDirectory";
import {
  COURT_TYPE_VALUES,
  GAME_VALUES,
  type CourtType,
  type Game,
} from "@/lib/constants";
import { listPublicHubDirectory } from "@/lib/hubs";
import { isValidDateString, manilaToday } from "@/lib/time";

export const metadata: Metadata = {
  title: "Find a Hub — Bunal.club",
  description:
    "Search and filter bookable pickleball, tennis, badminton, and volleyball courts across Bohol.",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isGame(value: string): value is Game {
  return (GAME_VALUES as readonly string[]).includes(value);
}

function isCourtType(value: string): value is CourtType {
  return (COURT_TYPE_VALUES as readonly string[]).includes(value);
}

function hourFromTime(value: string): number | undefined {
  if (!/^\d{2}:00$/.test(value)) return undefined;
  const hour = Number(value.slice(0, 2));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23
    ? hour
    : undefined;
}

function isSort(
  value: string
): value is "name" | "price" | "newest" | "distance" {
  return ["name", "price", "newest", "distance"].includes(value);
}

export default async function HubsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const sp = await searchParams;
  const query = first(sp.q);
  const gameValue = first(sp.game);
  const courtTypeValue = first(sp.courtType);
  const requestedDate = first(sp.date);
  const from = first(sp.from);
  const to = first(sp.to);
  const sortValue = first(sp.sort);

  const game = isGame(gameValue) ? gameValue : undefined;
  const courtType = isCourtType(courtTypeValue)
    ? courtTypeValue
    : undefined;
  const fromHour = hourFromTime(from);
  const toHour = hourFromTime(to);
  const validRange =
    fromHour != null && toHour != null && fromHour < toHour;
  const date =
    requestedDate && isValidDateString(requestedDate)
      ? requestedDate
      : validRange
        ? manilaToday()
        : undefined;

  const hubs = await listPublicHubDirectory({
    game,
    courtType,
    date,
    fromHour: validRange ? fromHour : undefined,
    toHour: validRange ? toHour : undefined,
  });
  const view: DirectoryHubView[] = hubs.map((hub) => ({
    ...hub,
    createdAt: hub.createdAt.toISOString(),
  }));

  return (
    <PageShell
      maxWidth="max-w-7xl"
      backgroundClass="bg-[#f7faf8]"
    >
      <HubDirectory
        hubs={view}
        today={manilaToday()}
        initial={{
          query,
          game: game ?? "",
          courtType: courtType ?? "",
          date: date ?? "",
          from,
          to,
          sort:
            isSort(sortValue) && sortValue !== "distance"
              ? sortValue
              : "name",
        }}
      />
    </PageShell>
  );
}
