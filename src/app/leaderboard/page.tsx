import type { Metadata } from "next";

import { JsonLd } from "@/components/JsonLd";
import { LeaderboardPage } from "@/components/leaderboard/LeaderboardPage";
import { PageShell } from "@/components/PageShell";
import { getDuprLeaderboard } from "@/lib/dupr";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

const description =
  "Explore separate Singles and Doubles DUPR rankings for Bunal.club pickleball players in Bohol.";

export const metadata: Metadata = {
  title: "Bohol Pickleball Rankings | Bunal.club",
  description,
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Bohol Pickleball Rankings | Bunal.club",
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
  name: "Bohol Pickleball Rankings",
  description,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  inLanguage: "en-PH",
};

export default async function LeaderboardRoute() {
  const snapshot = await getDuprLeaderboard();

  return (
    <PageShell maxWidth="max-w-none" backgroundClass="bg-[#f7faf8]" padded={false}>
      <JsonLd data={leaderboardJsonLd} />
      <LeaderboardPage snapshot={snapshot} />
    </PageShell>
  );
}
