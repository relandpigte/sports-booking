import Link from "next/link";
import type { Metadata } from "next";
import { PublicTopBar } from "@/components/hubs/PublicTopBar";
import { HubCard } from "@/components/hubs/HubCard";
import { listPublicHubs } from "@/lib/hubs";
import { GAMES, GAME_VALUES, GAME_LABELS, type Game } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Find a Hub — Sports 360",
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
    <div className="min-h-screen bg-white">
      <PublicTopBar />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <div className="mt-6">
          <h1 className="text-2xl font-bold text-gray-900">Find a Hub</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse venues and clubs by court game.
          </p>
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
      </main>
    </div>
  );
}
