import Link from "next/link";

import { RankingsExplorer } from "@/components/leaderboard/RankingsExplorer";
import type { LeaderboardSnapshot } from "@/lib/leaderboard";

const DUPR_SIGNUP_URL = "https://dashboard.dupr.com/signup";

export function LeaderboardPage({
  snapshot,
}: {
  snapshot: LeaderboardSnapshot;
}) {
  return (
    <div className="min-h-screen bg-[#f7faf8]">
      <Hero snapshot={snapshot} />

      <nav aria-label="Leaderboard sections" className="border-b border-[#dfe7e2] bg-white">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
          <a
            href="#singles"
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-navy transition-colors hover:bg-primary-soft hover:text-primary"
          >
            Singles rankings
          </a>
          <a
            href="#doubles"
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-navy transition-colors hover:bg-primary-soft hover:text-primary"
          >
            Doubles rankings
          </a>
          <a
            href="#about-ratings"
            className="inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-slate-500 transition-colors hover:bg-primary-soft hover:text-primary"
          >
            How rankings work
          </a>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {snapshot.status === "available" ? (
          <RankingsExplorer
            singles={snapshot.singles}
            doubles={snapshot.doubles}
          />
        ) : (
          <PendingRankings status={snapshot.status} />
        )}

        <RatingsInfo />
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
        : "Official club connection in progress";

  return (
    <header className="relative overflow-hidden bg-navy px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-48 left-1/4 h-80 w-80 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Bohol pickleball
          </span>
          <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
            Player rankings,
            <br className="hidden sm:block" /> kept in their own lane.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Explore separate Singles and Doubles rankings for members returned
            by the Bunal.club DUPR club integration.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            <HeroStatus icon="shield" label="Ratings powered by DUPR" />
            <HeroStatus icon="refresh" label={status} />
          </div>
        </div>
      </div>
    </header>
  );
}

function HeroStatus({
  icon,
  label,
}: {
  icon: "shield" | "refresh";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-3 text-sm font-semibold text-white/75">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-accent">
        {icon === "shield" ? <ShieldIcon /> : <RefreshIcon />}
      </span>
      {label}
    </span>
  );
}

function PendingRankings({
  status,
}: {
  status: "unconfigured" | "unavailable";
}) {
  const unavailable = status === "unavailable";

  return (
    <div>
      <section className="mb-14 overflow-hidden rounded-[24px] border border-[#dfe7e2] bg-navy-soft shadow-sm shadow-navy/5">
        <div className="grid items-center gap-8 p-7 sm:p-10 md:grid-cols-[1fr_auto] md:p-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {unavailable ? "Connection interrupted" : "Integration in progress"}
            </span>
            <h2 className="mt-6 text-3xl font-black tracking-[-0.035em] text-navy">
              {unavailable
                ? "Official rankings will be back soon."
                : "Ready your DUPR profile."}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-500">
              {unavailable
                ? "We could not refresh the official club list right now. No cached or invented rankings are being shown in its place."
                : "We’re preparing the official Bunal.club club connection. Once it is configured, eligible members returned by DUPR will appear here automatically."}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={DUPR_SIGNUP_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                Create or review DUPR profile
                <span aria-hidden="true" className="ml-2">↗</span>
              </a>
              <Link
                href="/hubs"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dfe7e2] bg-white px-5 text-sm font-bold text-navy transition-colors hover:bg-[#f7faf8]"
              >
                Browse Bohol hubs
              </Link>
            </div>
          </div>
          <span className="flex h-28 w-28 items-center justify-center rounded-[32px] border border-[#dfe7e2] bg-white text-primary shadow-sm sm:h-32 sm:w-32">
            <DatabaseIcon />
          </span>
        </div>
      </section>

      <PendingSection id="singles" title="Singles rankings" />
      <PendingSection id="doubles" title="Doubles rankings" />
    </div>
  );
}

function PendingSection({ id, title }: { id: string; title: string }) {
  return (
    <section id={id} className="scroll-mt-28 pb-16 sm:pb-20">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
        Separate leaderboard
      </p>
      <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-navy sm:text-3xl">
        {title}
      </h2>
      <div className="mt-5 rounded-[20px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center sm:py-16">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <ListIcon />
        </span>
        <h3 className="mt-4 font-bold text-navy">Awaiting official club ratings</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          This list stays empty until DUPR returns real Bunal.club club members
          and their current {id === "singles" ? "Singles" : "Doubles"} ratings.
        </p>
      </div>
    </section>
  );
}

function RatingsInfo() {
  return (
    <section
      id="about-ratings"
      className="scroll-mt-28 border-t border-[#dfe7e2] py-14 sm:py-18"
    >
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            How rankings work
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-navy">
            One player, two distinct ratings.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-500">
            DUPR provides separate ratings for Singles and Doubles. Each list
            is sorted from highest to lowest, while an unrated player appears
            as NR after rated members. Ratings display to three decimal places.
          </p>
        </div>
        <div className="rounded-[20px] border border-[#dfe7e2] bg-white p-6 sm:p-8">
          <h3 className="font-black text-navy">Who appears here?</h3>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            Only members returned by the official Bunal.club DUPR club
            integration are eligible. Depending on partner permissions, DUPR
            may return only members who have connected or consented.
          </p>
          <a
            href={DUPR_SIGNUP_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex min-h-11 items-center font-bold text-ocean transition-colors hover:text-navy"
          >
            Review your DUPR account <span aria-hidden="true" className="ml-2">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3 20 7v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8A7 7 0 0 1 18 6l2 2M17.9 16A7 7 0 0 1 6 18l-2-2" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-12 w-12" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3 1.1 0 2.1-.1 3-.2" />
      <path d="m17 17 2 2 3-4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}
