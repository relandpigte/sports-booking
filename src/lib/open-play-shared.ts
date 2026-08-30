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
  SKILL_SEPARATED: "Skill Separated",
  WINNERS_LOSERS: "Winners / Losers",
  FIXED_PARTNERS: "Fixed Partners",
};

export const OPEN_PLAY_MODE_DESCRIPTIONS: Record<OpenPlayMatchingMode, string> = {
  BALANCED:
    "Takes the next four players, balances teams by skill, and avoids repeat teammates when possible.",
  SKILL_SEPARATED:
    "Waits for four players at the same skill level; the earliest eligible group plays next.",
  WINNERS_LOSERS:
    "Groups the first waiting player with others sharing their previous result when possible, then uses queue order.",
  FIXED_PARTNERS:
    "Keeps saved partners together and selects the next two complete pairs in queue order.",
};

export const OPEN_PLAY_MODES = Object.keys(
  OPEN_PLAY_MODE_LABELS
) as OpenPlayMatchingMode[];

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
  updatedAt: string;
  queue: {
    publicId: string;
    title: string;
    kind: OpenPlayQueueKind;
    admissionMode: OpenPlayAdmissionMode;
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
    pairId: string | null;
    estimatedWaitMinutes: number | null;
  }>;
  games: Array<{
    id: string;
    sequence: number;
    courtId: string;
    courtName: string;
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
