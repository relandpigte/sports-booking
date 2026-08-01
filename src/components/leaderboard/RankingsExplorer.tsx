"use client";

import { useMemo, useState } from "react";

import type {
  RankingEntry,
  RatingReliability,
} from "@/lib/leaderboard";

type RankedEntry = RankingEntry & { rank: number };

export function RankingsExplorer({
  singles,
  doubles,
}: {
  singles: RankingEntry[];
  doubles: RankingEntry[];
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    const filter = (entries: RankingEntry[]) =>
      entries
        .map((entry, index) => ({ ...entry, rank: index + 1 }))
        .filter(
          (entry) =>
            !needle || entry.fullName.toLocaleLowerCase().includes(needle)
        );

    return { singles: filter(singles), doubles: filter(doubles) };
  }, [doubles, needle, singles]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-sm font-bold text-navy">Find a player</p>
          <p className="mt-1 text-xs text-slate-500">
            Search both official Singles and Doubles lists.
          </p>
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search rankings by player name</span>
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player name"
            className="min-h-11 w-full rounded-xl border border-[#dfe7e2] bg-[#f7faf8] py-2.5 pl-11 pr-4 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none"
          />
        </label>
      </div>

      <RankingSection
        id="singles"
        title="Singles rankings"
        description="Individual player ratings, ordered from highest to lowest."
        entries={filtered.singles}
        total={singles.length}
        query={query}
      />
      <RankingSection
        id="doubles"
        title="Doubles rankings"
        description="Doubles-format player ratings, kept separate from Singles."
        entries={filtered.doubles}
        total={doubles.length}
        query={query}
      />
    </div>
  );
}

function RankingSection({
  id,
  title,
  description,
  entries,
  total,
  query,
}: {
  id: string;
  title: string;
  description: string;
  entries: RankedEntry[];
  total: number;
  query: string;
}) {
  return (
    <section id={id} className="scroll-mt-28 pb-16 sm:pb-20">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Official club list
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-navy sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <p className="text-sm font-semibold text-slate-500">
          {entries.length === total
            ? `${total} ${total === 1 ? "player" : "players"}`
            : `${entries.length} of ${total}`}
        </p>
      </div>

      {entries.length ? (
        <ol className="overflow-hidden rounded-[20px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5">
          <li
            aria-hidden="true"
            className="hidden grid-cols-[72px_minmax(0,1fr)_120px_150px] border-b border-[#dfe7e2] bg-[#f7faf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:grid"
          >
            <span>Rank</span>
            <span>Player</span>
            <span>Rating</span>
            <span className="text-right">Reliability</span>
          </li>
          {entries.map((entry) => (
            <RankingRow
              key={entry.duprId}
              entry={entry}
              rank={entry.rank}
            />
          ))}
        </ol>
      ) : (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-soft text-navy">
            <SearchIcon standalone />
          </span>
          <h3 className="mt-4 font-bold text-navy">
            {total ? "No player matches that search" : "No club members yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            {total
              ? `Try another name instead of “${query.trim()}”.`
              : "DUPR did not return any members for this club ranking."}
          </p>
        </div>
      )}
    </section>
  );
}

function RankingRow({ entry, rank }: { entry: RankingEntry; rank: number }) {
  const initials = entry.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#dfe7e2] px-4 py-4 last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_120px_150px] sm:px-5">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${rankClass(rank)}`}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe7e2] bg-primary-soft text-xs font-black text-primary">
          {initials || "?"}
        </span>
        <p className="truncate text-sm font-bold text-navy">
          {entry.fullName}
        </p>
      </div>
      <div className="text-right sm:text-left">
        <p className="font-mono text-sm font-black text-navy">
          {entry.rating == null ? "NR" : entry.rating.toFixed(3)}
        </p>
        <div className="mt-1 sm:hidden">
          <ReliabilityBadge reliability={entry.reliability} compact />
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <ReliabilityBadge reliability={entry.reliability} />
      </div>
    </li>
  );
}

function rankClass(rank: number): string {
  if (rank === 1) return "bg-navy text-white ring-2 ring-accent/60";
  if (rank === 2) return "bg-primary-soft text-primary";
  if (rank === 3) return "bg-ocean-soft text-ocean";
  return "bg-slate-100 text-slate-500";
}

function ReliabilityBadge({
  reliability,
  compact = false,
}: {
  reliability: RatingReliability;
  compact?: boolean;
}) {
  const labels: Record<RatingReliability, string> = {
    reliable: "Reliable",
    provisional: "Provisional",
    unknown: "Not provided",
    "not-rated": "Not rated",
  };
  const tones: Record<RatingReliability, string> = {
    reliable: "bg-primary-soft text-primary",
    provisional: "bg-accent-soft text-navy",
    unknown: "bg-slate-100 text-slate-500",
    "not-rated": "bg-slate-100 text-slate-500",
  };

  return (
    <span
      className={`inline-flex rounded-full font-bold ${tones[reliability]} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      {labels[reliability]}
    </span>
  );
}

function SearchIcon({ standalone = false }: { standalone?: boolean }) {
  return (
    <svg
      className={
        standalone
          ? "h-5 w-5"
          : "pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
      }
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
