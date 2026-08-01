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
