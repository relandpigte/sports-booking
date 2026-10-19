export type RatingReliability =
  | "reliable"
  | "provisional"
  | "unknown"
  | "not-rated";

export type RankingEntry = {
  duprId: string;
  fullName: string;
  rating: number | null;
  reliability: RatingReliability;
  // Set when this DUPR player connected a public Bunal.club profile.
  profilePath?: string;
};

export type LeaderboardSnapshot =
  | { status: "unconfigured" }
  | { status: "unavailable" }
  | {
      status: "available";
      updatedAt: string;
      singles: RankingEntry[];
      doubles: RankingEntry[];
    };

export function topRatedPlayers(
  entries: RankingEntry[],
  limit = 10
): RankingEntry[] {
  return entries.filter((entry) => entry.rating !== null).slice(0, limit);
}
