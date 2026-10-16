import type {
  OpenPlayAdmissionMode,
  OpenPlayGameStatus,
  OpenPlayLastResult,
  OpenPlayMatchingMode,
  OpenPlayParticipantSource,
  OpenPlayParticipantStatus,
  OpenPlayQueueKind,
  OpenPlaySelectionMethod,
  OpenPlaySessionStatus,
} from "@prisma/client";

export const OPEN_PLAY_MODE_LABELS: Record<OpenPlayMatchingMode, string> = {
  BALANCED: "Balanced",
  ROUND_ROBIN: "Round Robin",
  SKILL_SEPARATED: "Skill Separated",
  WINNERS_LOSERS: "Winners / Losers",
  FIXED_PARTNERS: "Fixed Partners",
};

export const OPEN_PLAY_MODE_DESCRIPTIONS: Record<OpenPlayMatchingMode, string> = {
  BALANCED:
    "Takes the next eligible players, keeps saved partners together, then balances team skill and avoids repeated pairings.",
  ROUND_ROBIN:
    "Prioritizes players with fewer games, keeps saved partners together, then rotates least-used partners and opponents.",
  SKILL_SEPARATED:
    "Uses the earliest skill tier with four waiting players, then rotates partners within that tier.",
  WINNERS_LOSERS:
    "Uses the earliest complete previous-result group, rotates partners, then falls back to queue order.",
  FIXED_PARTNERS:
    "Keeps saved partners together and selects the next two complete pairs in queue order.",
};

export const OPEN_PLAY_MODES = Object.keys(
  OPEN_PLAY_MODE_LABELS
) as OpenPlayMatchingMode[];

// A run holds at most this many courts, and at most this many Up next matches.
export const OPEN_PLAY_MAX_COURTS = 12;
export const OPEN_PLAY_MAX_UP_NEXT_SLOTS = 12;

export type OpenPlayActionState = {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
  reloadRequired?: boolean;
};

export type OpenPlaySnapshot = {
  id: string;
  runNumber: number;
  status: OpenPlaySessionStatus;
  matchingMode: OpenPlayMatchingMode;
  upNextSlots: number;
  updatedAt: string;
  // Operator snapshots only: how a court can be added to this run. Guest rooms
  // create the next numbered court; venue queues pick an eligible hub court.
  courtAdd:
    | null
    | { kind: "AUTO"; remaining: number }
    | { kind: "PICK"; courts: Array<{ id: string; name: string }> };
  queue: {
    publicId: string;
    title: string;
    kind: OpenPlayQueueKind;
    admissionMode: OpenPlayAdmissionMode;
    guestCreated: boolean;
    hub: { name: string; address: string | null };
    event: {
      publicId: string;
      date: string;
      startHour: number;
      endHour: number;
      status: "DRAFT" | "PUBLISHED" | "CANCELLED";
    } | null;
  };
  courts: Array<{
    id: string;
    name: string;
    active: boolean;
    position: number;
  }>;
  participants: Array<{
    id: string;
    displayName: string;
    skillLevel: string;
    source: OpenPlayParticipantSource;
    status: OpenPlayParticipantStatus;
    lastResult: OpenPlayLastResult;
    queuePosition: number | null;
    queuedAt: string | null;
    checkedInAt: string | null;
    pairId: string | null;
    estimatedWaitMinutes: number | null;
  }>;
  games: Array<{
    id: string;
    sequence: number;
    courtId: string | null;
    courtName: string | null;
    status: OpenPlayGameStatus;
    matchingMode: OpenPlayMatchingMode;
    selectionMethod: OpenPlaySelectionMethod;
    winningTeam: number | null;
    startedAt: string | null;
    completedAt: string | null;
    players: Array<{
      participantId: string;
      displayName: string;
      team: number;
      slot: number;
    }>;
  }>;
  standings: Array<{
    participantId: string;
    displayName: string;
    wins: number;
    losses: number;
    games: number;
    winRate: number;
  }>;
  averageGameMinutes: number;
};
