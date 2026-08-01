import { TopRankings } from "@/components/leaderboard/TopRankings";
import {
  topRatedPlayers,
  type LeaderboardSnapshot,
} from "@/lib/leaderboard";

const DUPR_GLOBAL_RANKINGS_URL = "https://www.dupr.com/rankings";

export function LeaderboardPage({
  snapshot,
}: {
  snapshot: LeaderboardSnapshot;
}) {
  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#f7faf8]">
      <Hero snapshot={snapshot} />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        {snapshot.status === "available" ? (
          <TopRankings
            singles={topRatedPlayers(snapshot.singles)}
            doubles={topRatedPlayers(snapshot.doubles)}
          />
        ) : (
          <UnavailableRankings status={snapshot.status} />
        )}

        <RankingsDisclosure />
      </div>
    </div>
  );
}

function Hero({ snapshot }: { snapshot: LeaderboardSnapshot }) {
  const status =
    snapshot.status === "available"
      ? `Updated ${formatUpdatedAt(snapshot.updatedAt)}`
      : snapshot.status === "unavailable"
        ? "DUPR is temporarily unavailable"
        : "Club connection in progress";

  return (
    <header className="relative overflow-hidden bg-navy px-4 py-14 text-center sm:px-6 sm:py-16 lg:px-8">
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-48 left-1/4 h-80 w-80 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl">
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
          Bunal.club × DUPR
        </span>
        <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl">
          Top players
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-white/70">
          See the highest-rated Bunal.club members returned by our DUPR club
          integration.
        </p>
        <p className="mt-6 inline-flex items-center justify-center gap-2 text-xs font-semibold text-white/55">
          <RefreshIcon />
          {status}
        </p>
      </div>
    </header>
  );
}

function UnavailableRankings({
  status,
}: {
  status: "unconfigured" | "unavailable";
}) {
  const unavailable = status === "unavailable";

  return (
    <section className="rounded-[20px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center sm:py-16">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-soft text-navy">
        <DatabaseIcon />
      </span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">
        {unavailable ? "Connection interrupted" : "Integration in progress"}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-navy">
        {unavailable ? "Rankings are temporarily unavailable" : "Rankings are coming soon"}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
        {unavailable
          ? "We could not refresh the Bunal.club member list from DUPR. Try again a little later."
          : "The Bunal.club DUPR connection is not configured yet. Real club-member ratings will appear here once it is ready."}
      </p>
    </section>
  );
}

function RankingsDisclosure() {
  return (
    <aside className="mt-9 rounded-2xl border border-dashed border-[#dfe7e2] bg-white/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-primary">
          <InfoIcon />
        </span>
        <div>
          <h2 className="text-sm font-black text-navy">About this leaderboard</h2>
          <p className="mt-1 text-xs leading-6 text-slate-500 sm:text-sm">
            This page ranks rated Bunal.club club members using Singles and
            Doubles values returned by the DUPR Partner API. It is informational
            and does not represent DUPR&apos;s global standings.
          </p>
          <a
            href={DUPR_GLOBAL_RANKINGS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-primary transition-colors hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            View global DUPR rankings
            <span aria-hidden="true" className="ml-2">↗</span>
          </a>
        </div>
      </div>
    </aside>
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8A7 7 0 0 1 18 6l2 2M17.9 16A7 7 0 0 1 6 18l-2-2" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3 1.1 0 2.1-.1 3-.2" />
      <path d="m17 17 2 2 3-4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
