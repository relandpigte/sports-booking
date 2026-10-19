import type { Metadata } from "next";

import { JsonLd } from "@/components/JsonLd";
import { LeaderboardPage } from "@/components/leaderboard/LeaderboardPage";
import { PageShell } from "@/components/PageShell";
import { getDuprLeaderboard } from "@/lib/dupr";
import { profilePathsForDuprIds } from "@/lib/dupr-link";
import type { LeaderboardSnapshot } from "@/lib/leaderboard";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

const description =
  "View the top-rated Bunal.club club members returned by the DUPR Partner API, with separate Singles and Doubles lists.";

export const metadata: Metadata = {
  title: "Top DUPR-Rated Club Players | Bunal.club",
  description,
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Top DUPR-Rated Club Players | Bunal.club",
    description,
    url: "/leaderboard",
    siteName: SITE_NAME,
    locale: "en_PH",
    type: "website",
  },
};

const leaderboardJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${absoluteUrl("/leaderboard")}#webpage`,
  url: absoluteUrl("/leaderboard"),
  name: "Bunal.club DUPR Club Leaderboard",
  description,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  inLanguage: "en-PH",
};

// Links ranked players who connected a public Bunal.club profile.
async function withProfileLinks(
  snapshot: LeaderboardSnapshot
): Promise<LeaderboardSnapshot> {
  if (snapshot.status !== "available") return snapshot;
  const paths = await profilePathsForDuprIds([
    ...new Set(
      [...snapshot.singles, ...snapshot.doubles].map((entry) => entry.duprId)
    ),
  ]);
  if (paths.size === 0) return snapshot;
  const link = (entries: typeof snapshot.singles) =>
    entries.map((entry) => {
      const profilePath = paths.get(entry.duprId);
      return profilePath ? { ...entry, profilePath } : entry;
    });
  return {
    ...snapshot,
    singles: link(snapshot.singles),
    doubles: link(snapshot.doubles),
  };
}

export default async function LeaderboardRoute() {
  const snapshot = await withProfileLinks(await getDuprLeaderboard());

  return (
    <PageShell
      maxWidth="max-w-none"
      backgroundClass="bg-[#f7faf8]"
      padded={false}
      alwaysPublic
    >
      <JsonLd data={leaderboardJsonLd} />
      <LeaderboardPage snapshot={snapshot} />
    </PageShell>
  );
}
