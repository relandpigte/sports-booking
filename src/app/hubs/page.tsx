import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { HubCard } from "@/components/hubs/HubCard";
import { listPublicHubs } from "@/lib/hubs";
import { GAMES, GAME_VALUES, GAME_LABELS, type Game } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Find a Hub — Bunal.ph",
  description: "Browse pickleball, tennis, and other court-game hubs near you.",
};

function isGame(value: string | undefined): value is Game {
  return !!value && (GAME_VALUES as readonly string[]).includes(value);
}

export default async function HubsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const sp = await searchParams;
  const game = isGame(sp.game) ? sp.game : undefined;
  const hubs = await listPublicHubs({ game });

  return (
    <PageShell maxWidth="max-w-5xl">
        {/* The badge's navy, used once at the top of the page rather than
            everywhere — it frames the list without competing with it. */}
        <div className="relative mt-6 overflow-hidden rounded-2xl bg-navy px-6 py-8 sm:px-8 sm:py-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Bohol · Philippines
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
              Find a court, book it in seconds
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/70">
              Volleyball, badminton and pickleball hubs near you — pick the
              hours you want and they&apos;re yours.
            </p>
          </div>
        </div>

        {/* Category filters */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/hubs"
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              !game
                ? "border-primary bg-primary text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            All
          </Link>
          {GAMES.map((g) => {
            const active = game === g.value;
            return (
              <Link
                key={g.value}
                href={`/hubs?game=${g.value}`}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {g.label}
              </Link>
            );
          })}
        </div>

        {hubs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center text-sm text-gray-500">
            {game
              ? `No hubs offer ${GAME_LABELS[game]} yet.`
              : "No hubs available yet. Check back soon."}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hubs.map((hub) => (
              <HubCard key={hub.id} hub={hub} />
            ))}
          </div>
        )}
    </PageShell>
  );
}
