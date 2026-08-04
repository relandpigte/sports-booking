import type { Metadata } from "next";

import { JsonLd } from "@/components/JsonLd";
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
import {
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site";
import { isValidDateString, manilaToday } from "@/lib/time";

const directoryDescription =
  "Discover pickleball, badminton, volleyball, and tennis hubs across the Philippines. Compare rates, see upcoming venues, and book verified courts securely online.";

export const metadata: Metadata = {
  title: "Find & Book Sports Courts Across the Philippines | Bunal.club",
  description: directoryDescription,
  alternates: {
    canonical: "/hubs",
  },
  openGraph: {
    title: "Find & Book Sports Courts Across the Philippines | Bunal.club",
    description: directoryDescription,
    url: "/hubs",
    siteName: SITE_NAME,
    locale: "en_PH",
    type: "website",
  },
};

const directoryJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${absoluteUrl("/hubs")}#webpage`,
      url: absoluteUrl("/hubs"),
      name: "Sports courts and hubs across the Philippines",
      description: directoryDescription,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      inLanguage: "en-PH",
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${absoluteUrl("/hubs")}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Hubs",
          item: absoluteUrl("/hubs"),
        },
      ],
    },
  ],
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
  const today = manilaToday();
  const selectedDate =
    requestedDate && isValidDateString(requestedDate)
      ? requestedDate
      : undefined;
  const availabilityDate = selectedDate ?? today;

  const hubs = await listPublicHubDirectory({
    game,
    courtType,
    date: availabilityDate,
    fromHour: validRange ? fromHour : undefined,
    toHour: validRange ? toHour : undefined,
  });
  const view: DirectoryHubView[] = hubs.map((hub) => ({
    ...hub,
    createdAt: hub.createdAt.toISOString(),
    updatedAt: hub.updatedAt.toISOString(),
  }));

  return (
    <PageShell
      maxWidth="max-w-7xl"
      backgroundClass="bg-[#f7faf8]"
    >
      <JsonLd data={directoryJsonLd} />
      <HubDirectory
        hubs={view}
        today={today}
        initial={{
          query,
          game: game ?? "",
          courtType: courtType ?? "",
          date: selectedDate ?? "",
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
