import "server-only";

import {
  type OpenPlayLastResult,
  type OpenPlayMatchingMode,
  type OpenPlayParticipantStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  getPartnerWorkspace,
  hasStaffAccess,
  type PartnerWorkspace,
} from "@/lib/staffing";
import {
  OPEN_PLAY_UP_NEXT_BUFFER_SIZE,
  type OpenPlaySnapshot,
} from "@/lib/open-play-shared";

export type MatchCandidate = {
  id: string;
  queuePosition: number;
  skillLevel: string;
  lastResult: OpenPlayLastResult;
  pairId: string | null;
};

export type MatchTeam = {
  participantId: string;
  team: 1 | 2;
  slot: 1 | 2 | 3 | 4;
  queuePositionBefore: number;
};

export type TeammateHistory = {
  counts: Map<string, number>;
  mostRecent: Map<string, string>;
};

type OpenPlayTx = Prisma.TransactionClient;

type StagedGameWithPlayers = {
  id: string;
  sequence: number;
  selectionMethod: "AUTOMATIC" | "MANUAL";
  players: Array<{
    participantId: string;
    queuePositionBefore: number;
  }>;
};

type CompletedGameForHistory = {
  sequence: number;
  completedAt?: Date | null;
  players: Array<{ participantId: string; team: number }>;
};

export type RoundRobinHistory = {
  gamesPlayed: Map<string, number>;
  teammateCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
};

type MatchUnit = {
  players: MatchCandidate[];
};

const skillScore: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

function pairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

export function buildTeammateHistory(
  games: CompletedGameForHistory[]
): TeammateHistory {
  const counts = new Map<string, number>();
  const mostRecent = new Map<string, string>();
  const ordered = [...games].sort((left, right) => {
    if (left.completedAt && right.completedAt) {
      return left.completedAt.getTime() - right.completedAt.getTime();
    }
    return left.sequence - right.sequence;
  });

  for (const game of ordered) {
    for (const team of [1, 2]) {
      const members = game.players.filter((player) => player.team === team);
      if (members.length !== 2) continue;
      const [first, second] = members;
      const key = pairKey(first.participantId, second.participantId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      mostRecent.set(first.participantId, second.participantId);
      mostRecent.set(second.participantId, first.participantId);
    }
  }

  return { counts, mostRecent };
}

export function buildRoundRobinHistory(
  games: CompletedGameForHistory[]
): RoundRobinHistory {
  const gamesPlayed = new Map<string, number>();
  const teammateCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  for (const game of games) {
    for (const player of game.players) {
      gamesPlayed.set(player.participantId, (gamesPlayed.get(player.participantId) ?? 0) + 1);
    }
    for (let leftIndex = 0; leftIndex < game.players.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < game.players.length; rightIndex += 1) {
        const left = game.players[leftIndex];
        const right = game.players[rightIndex];
        const key = pairKey(left.participantId, right.participantId);
        const counts = left.team === right.team ? teammateCounts : opponentCounts;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return { gamesPlayed, teammateCounts, opponentCounts };
}

function buildMatchUnits(players: MatchCandidate[]): MatchUnit[] {
  const pairMembers = new Map<string, MatchCandidate[]>();
  const units: MatchUnit[] = [];

  for (const player of players) {
    if (!player.pairId) {
      units.push({ players: [player] });
      continue;
    }
    const members = pairMembers.get(player.pairId) ?? [];
    members.push(player);
    pairMembers.set(player.pairId, members);
  }

  for (const members of pairMembers.values()) {
    if (members.length === 2) units.push({ players: members });
  }

  return units;
}

function compareQueueSelections(
  left: MatchCandidate[],
  right: MatchCandidate[]
): number {
  const queueOrder = (players: MatchCandidate[]) =>
    [...players].sort(
      (first, second) =>
        second.queuePosition - first.queuePosition ||
        first.id.localeCompare(second.id)
    );
  const leftOrder = queueOrder(left);
  const rightOrder = queueOrder(right);
  for (let index = 0; index < leftOrder.length; index += 1) {
    const queueDifference =
      leftOrder[index].queuePosition - rightOrder[index].queuePosition;
    if (queueDifference !== 0) return queueDifference;
  }
  return leftOrder
    .map((player) => player.id)
    .join(":")
    .localeCompare(rightOrder.map((player) => player.id).join(":"));
}

function selectBalancedPlayers(players: MatchCandidate[]): MatchCandidate[] | null {
  const bestBySize: Array<MatchCandidate[] | null> = [[], null, null, null, null];
  for (const unit of buildMatchUnits(players)) {
    for (let size = 4; size >= unit.players.length; size -= 1) {
      const previous = bestBySize[size - unit.players.length];
      if (!previous) continue;
      const candidate = [...previous, ...unit.players];
      const current = bestBySize[size];
      if (!current || compareQueueSelections(candidate, current) < 0) {
        bestBySize[size] = candidate;
      }
    }
  }
  return bestBySize[4];
}

function keepsFixedPartnersTogether(
  players: MatchCandidate[],
  teams: readonly [readonly [number, number], readonly [number, number]]
): boolean {
  const teamByIndex = new Map<number, number>();
  teams.forEach((team, teamIndex) => {
    team.forEach((playerIndex) => teamByIndex.set(playerIndex, teamIndex));
  });
  const pairTeams = new Map<string, number>();
  for (let index = 0; index < players.length; index += 1) {
    const pairId = players[index].pairId;
    if (!pairId) continue;
    const team = teamByIndex.get(index);
    if (team === undefined) return false;
    const existingTeam = pairTeams.get(pairId);
    if (existingTeam !== undefined && existingTeam !== team) return false;
    pairTeams.set(pairId, team);
  }
  return true;
}

function roundRobinCandidates(
  players: MatchCandidate[],
  history: RoundRobinHistory
): MatchCandidate[] {
  const units = buildMatchUnits(players).sort((left, right) => {
    const gamesPlayed = (unit: MatchUnit) =>
      Math.max(
        ...unit.players.map(
          (player) => history.gamesPlayed.get(player.id) ?? 0
        )
      );
    const queuePosition = (unit: MatchUnit) =>
      Math.max(...unit.players.map((player) => player.queuePosition));
    return (
      gamesPlayed(left) - gamesPlayed(right) ||
      queuePosition(left) - queuePosition(right) ||
      left.players[0].id.localeCompare(right.players[0].id)
    );
  });
  let playerCount = 0;
  let maximumGames = Number.POSITIVE_INFINITY;
  for (const unit of units) {
    playerCount += unit.players.length;
    maximumGames = Math.max(
      ...unit.players.map((player) => history.gamesPlayed.get(player.id) ?? 0)
    );
    if (playerCount >= 4) break;
  }
  if (playerCount < 4) return [];

  const candidates: MatchCandidate[] = [];
  for (const unit of units) {
    const unitGames = Math.max(
      ...unit.players.map((player) => history.gamesPlayed.get(player.id) ?? 0)
    );
    if (unitGames > maximumGames) break;
    if (candidates.length + unit.players.length > 16) break;
    candidates.push(...unit.players);
  }
  return candidates;
}

function roundRobinTeams(
  players: MatchCandidate[],
  history: RoundRobinHistory
): MatchTeam[] | null {
  const candidates = roundRobinCandidates(players, history);
  if (candidates.length < 4) return null;
  const arrangements = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ] as const;
  const ranked: Array<{
    players: MatchCandidate[];
    teams: (typeof arrangements)[number];
    score: number[];
  }> = [];
  let combinationIndex = 0;
  for (let a = 0; a < candidates.length - 3; a += 1) {
    for (let b = a + 1; b < candidates.length - 2; b += 1) {
      for (let c = b + 1; c < candidates.length - 1; c += 1) {
        for (let d = c + 1; d < candidates.length; d += 1) {
          const selected = [candidates[a], candidates[b], candidates[c], candidates[d]];
          const selectedPairCounts = new Map<string, number>();
          selected.forEach((player) => {
            if (player.pairId) {
              selectedPairCounts.set(
                player.pairId,
                (selectedPairCounts.get(player.pairId) ?? 0) + 1
              );
            }
          });
          if ([...selectedPairCounts.values()].some((count) => count !== 2)) {
            continue;
          }
          const gameCounts = selected.map(
            (player) => history.gamesPlayed.get(player.id) ?? 0
          );
          let totalEncounterUsage = 0;
          for (let left = 0; left < selected.length - 1; left += 1) {
            for (let right = left + 1; right < selected.length; right += 1) {
              const key = pairKey(selected[left].id, selected[right].id);
              totalEncounterUsage +=
                (history.teammateCounts.get(key) ?? 0) +
                (history.opponentCounts.get(key) ?? 0);
            }
          }
          arrangements.forEach((teams, arrangementIndex) => {
            if (!keepsFixedPartnersTogether(selected, teams)) return;
            const [[firstLeft, firstRight], [secondLeft, secondRight]] = teams;
            const teammateUsages = [
              history.teammateCounts.get(
                pairKey(selected[firstLeft].id, selected[firstRight].id)
              ) ?? 0,
              history.teammateCounts.get(
                pairKey(selected[secondLeft].id, selected[secondRight].id)
              ) ?? 0,
            ];
            const opponentUsages = [firstLeft, firstRight].flatMap((left) =>
              [secondLeft, secondRight].map(
                (right) =>
                  history.opponentCounts.get(
                    pairKey(selected[left].id, selected[right].id)
                  ) ?? 0
              )
            );
            ranked.push({
              players: selected,
              teams,
              score: [
                gameCounts.reduce((total, count) => total + count, 0),
                Math.max(...gameCounts),
                teammateUsages.reduce((total, count) => total + count, 0),
                Math.max(...teammateUsages),
                totalEncounterUsage,
                opponentUsages.reduce((total, count) => total + count, 0),
                selected.reduce((total, player) => total + player.queuePosition, 0),
                Math.max(...selected.map((player) => player.queuePosition)),
                combinationIndex,
                arrangementIndex,
              ],
            });
          });
          combinationIndex += 1;
        }
      }
    }
  }
  ranked.sort((left, right) => {
    for (let index = 0; index < left.score.length; index += 1) {
      if (left.score[index] !== right.score[index]) {
        return left.score[index] - right.score[index];
      }
    }
    return 0;
  });
  const winner = ranked[0];
  if (!winner) return null;
  const [[firstLeft, firstRight], [secondLeft, secondRight]] = winner.teams;
  return [
    { participantId: winner.players[firstLeft].id, team: 1, slot: 1, queuePositionBefore: winner.players[firstLeft].queuePosition },
    { participantId: winner.players[firstRight].id, team: 1, slot: 2, queuePositionBefore: winner.players[firstRight].queuePosition },
    { participantId: winner.players[secondLeft].id, team: 2, slot: 3, queuePositionBefore: winner.players[secondLeft].queuePosition },
    { participantId: winner.players[secondRight].id, team: 2, slot: 4, queuePositionBefore: winner.players[secondRight].queuePosition },
  ];
}

function balancedTeams(
  players: MatchCandidate[],
  teammateHistory: TeammateHistory,
  keepFixedPartners = false
): MatchTeam[] | null {
  const arrangements = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ] as const;
  const ranked = arrangements.flatMap((teams, index) => {
    if (keepFixedPartners && !keepsFixedPartnersTogether(players, teams)) {
      return [];
    }
    const [[a, b], [c, d]] = teams;
    const first = (skillScore[players[a].skillLevel] ?? 2) +
      (skillScore[players[b].skillLevel] ?? 2);
    const second = (skillScore[players[c].skillLevel] ?? 2) +
      (skillScore[players[d].skillLevel] ?? 2);
    const pairs = [[players[a], players[b]], [players[c], players[d]]] as const;
    const immediateRepeats = pairs.reduce(
      (total, [left, right]) =>
        total +
        Number(teammateHistory.mostRecent.get(left.id) === right.id) +
        Number(teammateHistory.mostRecent.get(right.id) === left.id),
      0
    );
    const usages = pairs.map(
      ([left, right]) =>
        teammateHistory.counts.get(pairKey(left.id, right.id)) ?? 0
    );
    return [{
      teams,
      index,
      difference: Math.abs(first - second),
      immediateRepeats,
      totalUsage: usages[0] + usages[1],
      maximumUsage: Math.max(...usages),
    }];
  });
  ranked.sort(
    (left, right) =>
      left.immediateRepeats - right.immediateRepeats ||
      left.totalUsage - right.totalUsage ||
      left.maximumUsage - right.maximumUsage ||
      left.difference - right.difference ||
      left.index - right.index
  );
  if (ranked.length === 0) return null;
  const [[a, b], [c, d]] = ranked[0].teams;
  return [
    { participantId: players[a].id, team: 1, slot: 1, queuePositionBefore: players[a].queuePosition },
    { participantId: players[b].id, team: 1, slot: 2, queuePositionBefore: players[b].queuePosition },
    { participantId: players[c].id, team: 2, slot: 3, queuePositionBefore: players[c].queuePosition },
    { participantId: players[d].id, team: 2, slot: 4, queuePositionBefore: players[d].queuePosition },
  ];
}

export function chooseAutomaticMatch(input: {
  mode: OpenPlayMatchingMode;
  queued: MatchCandidate[];
  teammateHistory?: TeammateHistory;
  completedGames?: CompletedGameForHistory[];
}): MatchTeam[] | null {
  const queued = [...input.queued].sort(
    (left, right) => left.queuePosition - right.queuePosition
  );
  if (queued.length < 4) return null;

  if (input.mode === "ROUND_ROBIN") {
    return roundRobinTeams(
      queued,
      buildRoundRobinHistory(input.completedGames ?? [])
    );
  }

  if (input.mode === "FIXED_PARTNERS") {
    const pairs = new Map<string, MatchCandidate[]>();
    for (const player of queued) {
      if (!player.pairId) continue;
      const members = pairs.get(player.pairId) ?? [];
      members.push(player);
      pairs.set(player.pairId, members);
    }
    const eligible = [...pairs.values()]
      .filter((members) => members.length === 2)
      .sort(
        (left, right) =>
          Math.max(...left.map((member) => member.queuePosition)) -
          Math.max(...right.map((member) => member.queuePosition))
      );
    if (eligible.length < 2) return null;
    return eligible.slice(0, 2).flatMap((members, teamIndex) =>
      members
        .sort((left, right) => left.queuePosition - right.queuePosition)
        .map((player, playerIndex) => ({
          participantId: player.id,
          team: (teamIndex + 1) as 1 | 2,
          slot: (teamIndex * 2 + playerIndex + 1) as 1 | 2 | 3 | 4,
          queuePositionBefore: player.queuePosition,
        }))
    );
  }

  let selected: MatchCandidate[];
  if (input.mode === "SKILL_SEPARATED") {
    const groups = new Map<string, MatchCandidate[]>();
    for (const player of queued) {
      const group = groups.get(player.skillLevel) ?? [];
      group.push(player);
      groups.set(player.skillLevel, group);
    }
    const eligible = [...groups.values()]
      .filter((group) => group.length >= 4)
      .sort((left, right) => left[0].queuePosition - right[0].queuePosition);
    if (eligible.length === 0) return null;
    selected = eligible[0].slice(0, 4);
  } else if (input.mode === "WINNERS_LOSERS") {
    const groups = new Map<OpenPlayLastResult, MatchCandidate[]>();
    for (const player of queued) {
      const group = groups.get(player.lastResult) ?? [];
      group.push(player);
      groups.set(player.lastResult, group);
    }
    const eligible = [...groups.values()]
      .filter((group) => group.length >= 4)
      .sort((left, right) => left[0].queuePosition - right[0].queuePosition);
    selected = eligible.length > 0 ? eligible[0].slice(0, 4) : queued.slice(0, 4);
  } else if (input.mode === "BALANCED") {
    const balancedSelection = selectBalancedPlayers(queued);
    if (!balancedSelection) return null;
    selected = balancedSelection;
  } else {
    selected = queued.slice(0, 4);
  }

  return balancedTeams(
    selected,
    input.teammateHistory ?? { counts: new Map(), mostRecent: new Map() },
    input.mode === "BALANCED"
  );
}

async function cancelStagedGames(
  tx: OpenPlayTx,
  sessionId: string,
  games: StagedGameWithPlayers[]
): Promise<void> {
  const now = new Date();
  for (const game of games) {
    for (const player of game.players) {
      await tx.openPlayParticipant.updateMany({
        where: {
          id: player.participantId,
          sessionId,
          status: "STAGED",
        },
        data: {
          status: "QUEUED",
          queuePosition: player.queuePositionBefore,
          queuedAt: now,
        },
      });
    }
    await tx.openPlayGame.updateMany({
      where: { id: game.id, sessionId, status: "STAGED" },
      data: { status: "CANCELLED", cancelledAt: now },
    });
  }
}

export async function cancelOpenPlayUpNextGame(
  tx: OpenPlayTx,
  sessionId: string,
  gameId: string
): Promise<boolean> {
  const game = await tx.openPlayGame.findFirst({
    where: { id: gameId, sessionId, status: "STAGED" },
    select: {
      id: true,
      sequence: true,
      selectionMethod: true,
      players: {
        select: { participantId: true, queuePositionBefore: true },
      },
    },
  });
  if (!game) return false;
  await cancelStagedGames(tx, sessionId, [game]);
  return true;
}

export async function syncAutomaticOpenPlayUpNext(
  tx: OpenPlayTx,
  input: {
    sessionId: string;
    createdById: string | null;
    refreshAutomatic?: boolean;
  }
): Promise<{ createdGameIds: string[]; assignedGameIds: string[] }> {
  // Callers hold the OpenPlaySession row lock, serializing every queue and
  // dispatch mutation so two requests cannot reserve the same participant.
  const session = await tx.openPlaySession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      status: true,
      matchingMode: true,
      courts: {
        orderBy: { position: "asc" },
        select: { courtId: true, active: true },
      },
      games: {
        where: { status: "ACTIVE", courtId: { not: null } },
        select: { courtId: true },
      },
    },
  });
  if (!session || session.status !== "ACTIVE") {
    return { createdGameIds: [], assignedGameIds: [] };
  }

  const activeCourtIds = new Set(
    session.games.flatMap((game) => game.courtId ? [game.courtId] : [])
  );
  const availableCourtSlots = session.courts.filter(
    (court) => court.active && !activeCourtIds.has(court.courtId)
  ).length;
  const targetCount = availableCourtSlots + OPEN_PLAY_UP_NEXT_BUFFER_SIZE;
  let staged = await tx.openPlayGame.findMany({
    where: { sessionId: session.id, status: "STAGED" },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      selectionMethod: true,
      players: {
        select: { participantId: true, queuePositionBefore: true },
      },
    },
  });

  if (input.refreshAutomatic) {
    const automatic = staged.filter(
      (game) => game.selectionMethod === "AUTOMATIC"
    );
    await cancelStagedGames(tx, session.id, automatic);
    const automaticIds = new Set(automatic.map((game) => game.id));
    staged = staged.filter((game) => !automaticIds.has(game.id));
  }

  if (staged.length > targetCount) {
    const excess = staged.length - targetCount;
    const removable = staged
      .filter((game) => game.selectionMethod === "AUTOMATIC")
      .slice(-excess);
    await cancelStagedGames(tx, session.id, removable);
    const removedIds = new Set(removable.map((game) => game.id));
    staged = staged.filter((game) => !removedIds.has(game.id));
  }

  const [completedGames, latestGame] = await Promise.all([
    tx.openPlayGame.findMany({
      where: { sessionId: session.id, status: "COMPLETED" },
      select: {
        sequence: true,
        completedAt: true,
        players: { select: { participantId: true, team: true } },
      },
    }),
    tx.openPlayGame.findFirst({
      where: { sessionId: session.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    }),
  ]);
  const teammateHistory = buildTeammateHistory(completedGames);
  const createdGameIds: string[] = [];
  let nextSequence = (latestGame?.sequence ?? 0) + 1;

  while (staged.length + createdGameIds.length < targetCount) {
    const queuedRows = await tx.openPlayParticipant.findMany({
      where: {
        sessionId: session.id,
        status: "QUEUED",
        queuePosition: { not: null },
      },
      orderBy: { queuePosition: "asc" },
      select: {
        id: true,
        queuePosition: true,
        skillLevel: true,
        lastResult: true,
        pairId: true,
      },
    });
    const queued = queuedRows.flatMap((row) =>
      row.queuePosition == null
        ? []
        : [{ ...row, queuePosition: row.queuePosition }]
    ) satisfies MatchCandidate[];
    const teams = chooseAutomaticMatch({
      mode: session.matchingMode,
      queued,
      teammateHistory,
      completedGames,
    });
    if (!teams) break;

    const game = await tx.openPlayGame.create({
      data: {
        sessionId: session.id,
        sequence: nextSequence,
        matchingMode: session.matchingMode,
        createdById: input.createdById,
        players: { create: teams },
      },
      select: { id: true },
    });
    nextSequence += 1;
    createdGameIds.push(game.id);
    await tx.openPlayParticipant.updateMany({
      where: {
        id: { in: teams.map((team) => team.participantId) },
        sessionId: session.id,
        status: "QUEUED",
      },
      data: { status: "STAGED", queuePosition: null, queuedAt: null },
    });
  }

  const occupiedCourtIds = new Set(
    (
      await tx.openPlayGame.findMany({
        where: {
          sessionId: session.id,
          status: { in: ["STAGED", "ACTIVE"] },
          courtId: { not: null },
        },
        select: { courtId: true },
      })
    ).flatMap((game) => game.courtId ? [game.courtId] : [])
  );
  const vacantCourtIds = session.courts
    .filter((court) => court.active && !occupiedCourtIds.has(court.courtId))
    .map((court) => court.courtId);
  const courtlessGames = await tx.openPlayGame.findMany({
    where: {
      sessionId: session.id,
      status: "STAGED",
      courtId: null,
    },
    orderBy: { sequence: "asc" },
    take: vacantCourtIds.length,
    select: { id: true },
  });
  const assignedGameIds: string[] = [];
  for (const [index, game] of courtlessGames.entries()) {
    const courtId = vacantCourtIds[index];
    if (!courtId) break;
    await tx.openPlayGame.update({
      where: { id: game.id },
      data: { courtId },
    });
    assignedGameIds.push(game.id);
  }

  return { createdGameIds, assignedGameIds };
}

export async function getOpenPlayWorkspace(
  required: "VIEW" | "MANAGE" = "VIEW"
): Promise<PartnerWorkspace | null> {
  const workspace = await getPartnerWorkspace();
  if (
    !workspace ||
    workspace.kind === "ADMIN_ASSIST" ||
    !hasStaffAccess(workspace, "openPlay", required)
  ) {
    return null;
  }
  return workspace;
}

const sessionInclude = {
  queue: {
    include: {
      hub: {
        select: {
          id: true,
          ownerId: true,
          name: true,
          address: true,
          guestBunalQOnly: true,
        },
      },
      event: {
        select: {
          id: true,
          publicId: true,
          date: true,
          startHour: true,
          endHour: true,
          status: true,
        },
      },
    },
  },
  courts: {
    include: { court: { select: { id: true, name: true } } },
    orderBy: { position: "asc" as const },
  },
  participants: {
    include: { pair: { select: { id: true } } },
    orderBy: [{ queuePosition: "asc" as const }, { createdAt: "asc" as const }],
  },
  games: {
    include: {
      court: { select: { id: true, name: true } },
      players: {
        include: {
          participant: { select: { id: true, displayName: true } },
        },
        orderBy: { slot: "asc" as const },
      },
    },
    orderBy: { sequence: "desc" as const },
  },
} satisfies Prisma.OpenPlaySessionInclude;

type SessionRecord = Prisma.OpenPlaySessionGetPayload<{
  include: typeof sessionInclude;
}>;

function gameDurationMinutes(session: SessionRecord): number {
  const durations = session.games.flatMap((game) =>
    game.status === "COMPLETED" && game.startedAt && game.completedAt
      ? [Math.max(1, (game.completedAt.getTime() - game.startedAt.getTime()) / 60_000)]
      : []
  );
  if (durations.length === 0) return 15;
  return Math.round(
    durations.reduce((total, duration) => total + duration, 0) / durations.length
  );
}

function standings(session: SessionRecord) {
  const rows = new Map<
    string,
    { participantId: string; displayName: string; wins: number; losses: number }
  >();
  for (const participant of session.participants) {
    rows.set(participant.id, {
      participantId: participant.id,
      displayName: participant.displayName,
      wins: 0,
      losses: 0,
    });
  }
  for (const game of session.games) {
    if (game.status !== "COMPLETED" || !game.winningTeam) continue;
    for (const slot of game.players) {
      const row = rows.get(slot.participantId);
      if (!row) continue;
      if (slot.team === game.winningTeam) row.wins += 1;
      else row.losses += 1;
    }
  }
  return [...rows.values()]
    .filter((row) => row.wins + row.losses > 0)
    .map((row) => ({
      ...row,
      games: row.wins + row.losses,
      winRate: row.wins / (row.wins + row.losses),
    }))
    .sort(
      (left, right) =>
        right.wins - left.wins ||
        right.winRate - left.winRate ||
        right.games - left.games ||
        left.displayName.localeCompare(right.displayName)
    );
}

function toSnapshot(
  session: SessionRecord,
  options: { publicView?: boolean } = {}
): OpenPlaySnapshot {
  const activeCourtCount = session.courts.filter((court) => court.active).length;
  const duration = gameDurationMinutes(session);
  const queue = session.participants.filter(
    (participant) => participant.status === "QUEUED"
  );
  const scheduledGameCount = session.games.filter((game) =>
    ["STAGED", "ACTIVE"].includes(game.status)
  ).length;
  const canEstimateWait =
    activeCourtCount > 0 &&
    queue.length >= 4 &&
    session.matchingMode === "BALANCED" &&
    queue.every((participant) => participant.pairId === null);
  const waits = new Map<string, number>();
  if (canEstimateWait) {
    queue.forEach((participant, index) => {
      const gamesAhead = scheduledGameCount + Math.floor(index / 4);
      const roundsAhead = Math.ceil(gamesAhead / activeCourtCount);
      waits.set(participant.id, roundsAhead * duration);
    });
  }
  const participants = options.publicView
    ? session.participants.filter(
        (participant) =>
          participant.status !== "PENDING_APPROVAL" &&
          participant.status !== "REMOVED"
      )
    : session.participants;
  return {
    id: session.id,
    runNumber: session.runNumber,
    status: session.status,
    matchingMode: session.matchingMode,
    updatedAt: session.updatedAt.toISOString(),
    queue: {
      publicId: session.queue.publicId,
      title: session.queue.title,
      kind: session.queue.kind,
      admissionMode: session.queue.admissionMode,
      guestCreated: session.queue.hub.guestBunalQOnly,
      hub: {
        name: session.queue.hub.name,
        address: session.queue.hub.address,
      },
      event: session.queue.event
        ? {
            publicId: session.queue.event.publicId,
            date: session.queue.event.date,
            startHour: session.queue.event.startHour,
            endHour: session.queue.event.endHour,
            status: session.queue.event.status,
          }
        : null,
    },
    courts: session.courts.map((court) => ({
      id: court.courtId,
      name: court.court.name,
      active: court.active,
      position: court.position,
    })),
    participants: participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      skillLevel: participant.skillLevel,
      source: participant.source,
      status: participant.status,
      lastResult: participant.lastResult,
      queuePosition: participant.queuePosition,
      pairId: participant.pairId,
      estimatedWaitMinutes: waits.get(participant.id) ?? null,
    })),
    games: session.games.map((game) => ({
      id: game.id,
      sequence: game.sequence,
      courtId: game.courtId,
      courtName: game.court?.name ?? null,
      status: game.status,
      matchingMode: game.matchingMode,
      selectionMethod: game.selectionMethod,
      winningTeam: game.winningTeam,
      startedAt: game.startedAt?.toISOString() ?? null,
      completedAt: game.completedAt?.toISOString() ?? null,
      players: game.players.map((slot) => ({
        participantId: slot.participantId,
        displayName: slot.participant.displayName,
        team: slot.team,
        slot: slot.slot,
      })),
    })),
    standings: standings(session),
    averageGameMinutes: duration,
  };
}

export async function getOperatorOpenPlaySnapshot(
  publicId: string,
  partnerId: string
): Promise<OpenPlaySnapshot | null> {
  const session = await prisma.openPlaySession.findFirst({
    where: {
      queue: {
        hub: { ownerId: partnerId },
        OR: [{ publicId }, { event: { publicId } }],
      },
    },
    orderBy: { runNumber: "desc" },
    include: sessionInclude,
  });
  return session ? toSnapshot(session) : null;
}

export async function getPublicOpenPlaySnapshot(
  publicId: string
): Promise<OpenPlaySnapshot | null> {
  const session = await prisma.openPlaySession.findFirst({
    where: {
      queue: {
        OR: [
          { publicId, kind: "QUICK" },
          {
            kind: "EVENT",
            event: {
              publicId,
              status: { in: ["PUBLISHED", "CANCELLED"] },
            },
          },
          {
            publicId,
            kind: "EVENT",
            event: { status: { in: ["PUBLISHED", "CANCELLED"] } },
          },
        ],
      },
    },
    orderBy: { runNumber: "desc" },
    include: sessionInclude,
  });
  return session ? toSnapshot(session, { publicView: true }) : null;
}

export async function getOpenPlayLiveRevision(
  publicId: string
): Promise<string | null> {
  // Pending and removed players stay out of public snapshots, but their changes
  // must still wake the organizer's live console. This value never leaves the server.
  const session = await prisma.openPlaySession.findFirst({
    where: {
      queue: {
        OR: [
          { publicId, kind: "QUICK" },
          {
            kind: "EVENT",
            event: {
              publicId,
              status: { in: ["PUBLISHED", "CANCELLED"] },
            },
          },
          {
            publicId,
            kind: "EVENT",
            event: { status: { in: ["PUBLISHED", "CANCELLED"] } },
          },
        ],
      },
    },
    orderBy: { runNumber: "desc" },
    select: { id: true, liveRevision: true },
  });
  if (!session) return null;
  return `${session.id}:${session.liveRevision}`;
}

export async function getOpenPlayEvent(publicId: string, partnerId: string) {
  return prisma.event.findFirst({
    where: { publicId, hub: { ownerId: partnerId } },
    select: {
      id: true,
      publicId: true,
      title: true,
      sport: true,
      date: true,
      startHour: true,
      endHour: true,
      status: true,
      hub: { select: { id: true, name: true } },
      courts: {
        include: { court: { select: { id: true, name: true } } },
      },
      openPlayQueue: {
        select: {
          publicId: true,
          sessions: {
            orderBy: { runNumber: "desc" },
            take: 1,
            select: { id: true, status: true, runNumber: true },
          },
        },
      },
    },
  });
}

export async function listOpenPlayQueues(partnerId: string) {
  return prisma.openPlayQueue.findMany({
    where: { hub: { ownerId: partnerId } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      publicId: true,
      title: true,
      kind: true,
      admissionMode: true,
      hub: { select: { name: true } },
      event: {
        select: {
          publicId: true,
          date: true,
          startHour: true,
          endHour: true,
          status: true,
        },
      },
      sessions: {
        orderBy: { runNumber: "desc" },
        take: 1,
        select: { status: true, runNumber: true },
      },
    },
  });
}

export async function listPublicBunalQQueues() {
  return prisma.openPlayQueue.findMany({
    where: {
      directoryListed: true,
      sessions: { some: { status: "ACTIVE" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      publicId: true,
      title: true,
      kind: true,
      admissionMode: true,
      hub: { select: { name: true, address: true } },
      event: {
        select: {
          publicId: true,
          date: true,
          startHour: true,
          endHour: true,
        },
      },
      sessions: {
        where: { status: "ACTIVE" },
        orderBy: { runNumber: "desc" },
        take: 1,
        select: {
          runNumber: true,
          startedAt: true,
          _count: {
            select: {
              participants: {
                where: {
                  status: { notIn: ["PENDING_APPROVAL", "REMOVED"] },
                },
              },
              courts: true,
            },
          },
        },
      },
    },
  });
}

export async function listBunalQEligibleEvents(partnerId: string) {
  return prisma.event.findMany({
    where: {
      hub: { ownerId: partnerId },
      sport: "pickleball",
      status: "PUBLISHED",
      openPlayQueue: null,
    },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: {
      publicId: true,
      title: true,
      date: true,
      startHour: true,
      endHour: true,
      hub: { select: { name: true } },
    },
  });
}

export async function listBunalQHubs(partnerId: string) {
  return prisma.hub.findMany({
    where: { ownerId: partnerId, games: { has: "pickleball" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      courts: {
        where: { OR: [{ sport: "pickleball" }, { sport: null }] },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
    },
  });
}

export async function listOpenPlayRunHistory(
  publicId: string,
  partnerId: string
) {
  return prisma.openPlaySession.findMany({
    where: { queue: { publicId, hub: { ownerId: partnerId } } },
    orderBy: { runNumber: "desc" },
    select: {
      id: true,
      runNumber: true,
      status: true,
      startedAt: true,
      endedAt: true,
      _count: { select: { participants: true, games: true } },
    },
  });
}

export function canTransitionParticipant(
  status: OpenPlayParticipantStatus,
  operation: "CHECK_IN" | "PAUSE" | "RESUME" | "CHECK_OUT"
): boolean {
  if (operation === "CHECK_IN") {
    return status === "NOT_CHECKED_IN" || status === "CHECKED_OUT";
  }
  if (operation === "PAUSE") {
    return status === "QUEUED" || status === "STAGED";
  }
  if (operation === "RESUME") return status === "PAUSED";
  return ["NOT_CHECKED_IN", "QUEUED", "PAUSED"].includes(status);
}
