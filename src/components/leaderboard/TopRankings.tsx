"use client";

import { useState } from "react";

import type {
  RankingEntry,
  RatingReliability,
} from "@/lib/leaderboard";

type RatingLane = "doubles" | "singles";

export function TopRankings({
  singles,
  doubles,
}: {
  singles: RankingEntry[];
  doubles: RankingEntry[];
}) {
  const [lane, setLane] = useState<RatingLane>("doubles");
  const entries = lane === "doubles" ? doubles : singles;
  const laneLabel = lane === "doubles" ? "Doubles" : "Singles";

  return (
    <section aria-labelledby="top-rankings-heading">
      <div className="mb-7 flex flex-col items-center gap-5 text-center sm:mb-9">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Club leaderboard
          </p>
          <h2
            id="top-rankings-heading"
            className="mt-2 text-2xl font-black tracking-[-0.035em] text-navy sm:text-3xl"
          >
            Top 10 {laneLabel} players
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Rating format"
          className="inline-flex rounded-full border border-[#dfe7e2] bg-white p-1 shadow-sm shadow-navy/5"
        >
          <FormatTab
            lane="doubles"
            activeLane={lane}
            onSelect={setLane}
          />
          <FormatTab lane="singles" activeLane={lane} onSelect={setLane} />
        </div>
      </div>

      <div
        id="top-rankings-panel"
        role="tabpanel"
        aria-label={`${laneLabel} top players`}
        className="overflow-hidden rounded-[20px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5"
      >
        {entries.length ? (
          <>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[76px_minmax(0,1fr)_120px_150px] border-b border-[#dfe7e2] bg-[#f7faf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:grid"
            >
              <span>Rank</span>
              <span>Player</span>
              <span>Rating</span>
              <span className="text-right">Reliability</span>
            </div>
            <ol>
              {entries.map((entry, index) => (
                <RankingRow
                  key={entry.duprId}
                  entry={entry}
                  rank={index + 1}
                />
              ))}
            </ol>
          </>
        ) : (
          <EmptyRankings laneLabel={laneLabel} />
        )}
      </div>
    </section>
  );
}

function FormatTab({
  lane,
  activeLane,
  onSelect,
}: {
  lane: RatingLane;
  activeLane: RatingLane;
  onSelect: (lane: RatingLane) => void;
}) {
  const active = lane === activeLane;
  const label = lane === "doubles" ? "Doubles" : "Singles";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls="top-rankings-panel"
      onClick={() => onSelect(lane)}
      className={`min-h-10 min-w-28 rounded-full px-6 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        active
          ? "bg-primary text-white shadow-sm"
          : "text-slate-500 hover:bg-primary-soft hover:text-primary"
      }`}
    >
      {label}
    </button>
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
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#dfe7e2] px-4 py-4 last:border-b-0 sm:grid-cols-[76px_minmax(0,1fr)_120px_150px] sm:px-5 sm:py-[18px]">
      <span
        aria-label={`Rank ${rank}`}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${rankClass(rank)}`}
      >
        {rank}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe7e2] bg-primary-soft text-xs font-black text-primary">
          {initials || "?"}
        </span>
        <p className="truncate text-sm font-bold text-navy">{entry.fullName}</p>
      </div>
      <div className="text-right sm:text-left">
        <p className="font-mono text-sm font-black text-navy">
          {entry.rating?.toFixed(3)}
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

function EmptyRankings({ laneLabel }: { laneLabel: string }) {
  return (
    <div className="px-6 py-14 text-center sm:py-16">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-soft text-navy">
        <UsersIcon />
      </span>
      <h3 className="mt-4 font-bold text-navy">No rated players yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        DUPR did not return a {laneLabel.toLowerCase()} rating for any current
        Bunal.club member.
      </p>
    </div>
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

function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
