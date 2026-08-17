import type {
  EventStatus,
  OpenPlayGameStatus,
  OpenPlayLastResult,
  OpenPlayMatchingMode,
  OpenPlayParticipantSource,
  OpenPlayParticipantStatus,
  OpenPlaySelectionMethod,
  OpenPlaySessionStatus,
} from "@prisma/client";

export const OPEN_PLAY_MODE_LABELS: Record<OpenPlayMatchingMode, string> = {
  BALANCED: "Balanced",
  SKILL_SEPARATED: "Skill Separated",
  WINNERS_LOSERS: "Winners / Losers",
  FIXED_PARTNERS: "Fixed Partners",
};

export const OPEN_PLAY_MODES = Object.keys(
  OPEN_PLAY_MODE_LABELS
) as OpenPlayMatchingMode[];

export type OpenPlayActionState = {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
};

export type OpenPlaySnapshot = {
  id: string;
  status: OpenPlaySessionStatus;
  matchingMode: OpenPlayMatchingMode;
  updatedAt: string;
  event: {
    publicId: string;
    title: string;
    date: string;
    startHour: number;
    endHour: number;
    status: EventStatus;
    hub: { name: string; address: string | null };
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
