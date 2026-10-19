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
  OPEN_PLAY_MAX_COURTS,
  type OpenPlaySnapshot,
} from "@/lib/open-play-shared";
import { courtDisplayOrder } from "@/lib/court-order";

export type MatchCandidate = {
  id: string;
  queuePosition: number;
  skillLevel: string;
  // The player's DUPR doubles rating when they connected DUPR.
  duprRating?: number | null;
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

// A self-picked tier mapped onto the DUPR scale, so players with and without
// a DUPR rating can be balanced against each other.
const TIER_RATING: Record<string, number> = {
  beginner: 2.5,
  intermediate: 3.5,
  advanced: 4.5,
};

// A player's strength for team balancing: their DUPR rating when connected,
// otherwise their tier.
export function matchSkill(player: {
  skillLevel: string;
  duprRating?: number | null;
}): number {
  return player.duprRating ?? TIER_RATING[player.skillLevel] ?? 3.5;
}

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

const TEAM_SPLITS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
] as const;

type TeamSplit = (typeof TEAM_SPLITS)[number];

function rankTeamSplits(
  players: MatchCandidate[],
  teammateHistory: TeammateHistory,
  keepFixedPartners: boolean
) {
  const ranked = TEAM_SPLITS.flatMap((teams, index) => {
    if (keepFixedPartners && !keepsFixedPartnersTogether(players, teams)) {
      return [];
    }
    const [[a, b], [c, d]] = teams;
    const first = matchSkill(players[a]) + matchSkill(players[b]);
    const second = matchSkill(players[c]) + matchSkill(players[d]);
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
  return ranked;
}

function splitToTeams(players: MatchCandidate[], teams: TeamSplit): MatchTeam[] {
  const [[a, b], [c, d]] = teams;
  return [
    { participantId: players[a].id, team: 1, slot: 1, queuePositionBefore: players[a].queuePosition },
    { participantId: players[b].id, team: 1, slot: 2, queuePositionBefore: players[b].queuePosition },
    { participantId: players[c].id, team: 2, slot: 3, queuePositionBefore: players[c].queuePosition },
    { participantId: players[d].id, team: 2, slot: 4, queuePositionBefore: players[d].queuePosition },
  ];
}

function balancedTeams(
  players: MatchCandidate[],
  teammateHistory: TeammateHistory,
  keepFixedPartners = false
): MatchTeam[] | null {
  const best = rankTeamSplits(players, teammateHistory, keepFixedPartners)[0];
  return best ? splitToTeams(players, best.teams) : null;
}

// Identifies a lineup by who partners whom, ignoring slot order, so a rebuild
// can tell whether matchmaking produced the same match again.
export function lineupKey(
  players: ReadonlyArray<{ participantId: string; team: number }>
): string {
  const team = (number: number) =>
    players
      .filter((player) => player.team === number)
      .map((player) => player.participantId)
      .sort()
      .join("+");
  return [team(1), team(2)].sort().join("|");
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

export type RebuiltMatch =
  | { kind: "NEW"; teams: MatchTeam[] }
  | { kind: "UNCHANGED" }
  | { kind: "NOT_ENOUGH_PLAYERS" };

// Rebuild never hands back the lineup it replaced. Returned players sit at the
// front of the queue, so plain matchmaking usually picks the same four; then a
// different team split is tried (only one that doesn't pair last game's
// teammates again), and failing that the last of the four in line makes way
// for the next waiting player.
export function chooseRebuiltMatch(input: {
  mode: OpenPlayMatchingMode;
  queued: MatchCandidate[];
  previous: ReadonlyArray<{ participantId: string; team: number }>;
  teammateHistory?: TeammateHistory;
  completedGames?: CompletedGameForHistory[];
}): RebuiltMatch {
  const history =
    input.teammateHistory ?? { counts: new Map(), mostRecent: new Map() };
  const previousKey =
    input.previous.length > 0 ? lineupKey(input.previous) : null;
  const first = chooseAutomaticMatch({ ...input, teammateHistory: history });
  if (!first) return { kind: "NOT_ENOUGH_PLAYERS" };
  if (lineupKey(first) !== previousKey) return { kind: "NEW", teams: first };

  const byId = new Map(input.queued.map((player) => [player.id, player]));
  const four = first.map((slot) => byId.get(slot.participantId)!);
  const alternative = rankTeamSplits(four, history, true).find(
    (split) =>
      split.immediateRepeats === 0 &&
      lineupKey(splitToTeams(four, split.teams)) !== previousKey
  );
  if (alternative) {
    return { kind: "NEW", teams: splitToTeams(four, alternative.teams) };
  }

  const lastInLine = [...first].sort(
    (left, right) => right.queuePositionBefore - left.queuePositionBefore
  )[0];
  const swapped = chooseAutomaticMatch({
    ...input,
    teammateHistory: history,
    queued: input.queued.filter(
      (player) => player.id !== lastInLine.participantId
    ),
  });
  if (swapped && lineupKey(swapped) !== previousKey) {
    return { kind: "NEW", teams: swapped };
  }
  return { kind: "UNCHANGED" };
}

// Auto-pick only looks this far down the eligible queue, so filling one open
// spot can favor a closer skill balance without passing over the players who
// have waited longest.
export const OPEN_SLOT_PICK_WINDOW = 4;

export type OpenSlotTeammate = {
  id: string;
  team: number;
  skillLevel: string;
  duprRating?: number | null;
  lastResult: OpenPlayLastResult;
};

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (best === undefined || count > counts.get(best)!) best = value;
  }
  return best;
}

export function chooseOpenSlotReplacement(input: {
  mode: OpenPlayMatchingMode;
  queued: MatchCandidate[];
  team: 1 | 2;
  remaining: OpenSlotTeammate[];
  teammateHistory?: TeammateHistory;
  completedGames?: CompletedGameForHistory[];
}): MatchCandidate | null {
  let pool = [...input.queued].sort(
    (left, right) => left.queuePosition - right.queuePosition
  );
  // Taking one half of a fixed pair would split it, so pairs are a last resort.
  const unpaired = pool.filter((player) => !player.pairId);
  if (unpaired.length > 0) pool = unpaired;

  const groupKey =
    input.mode === "SKILL_SEPARATED"
      ? (player: { skillLevel: string }) => player.skillLevel
      : input.mode === "WINNERS_LOSERS"
        ? (player: { lastResult: OpenPlayLastResult }) => player.lastResult
        : null;
  if (groupKey) {
    const target = mostCommon(input.remaining.map(groupKey));
    const sameGroup = pool.filter((player) => groupKey(player) === target);
    if (sameGroup.length > 0) pool = sameGroup;
  }

  if (input.mode === "ROUND_ROBIN") {
    const { gamesPlayed } = buildRoundRobinHistory(input.completedGames ?? []);
    const fewest = Math.min(
      ...pool.map((player) => gamesPlayed.get(player.id) ?? 0)
    );
    pool = pool.filter(
      (player) => (gamesPlayed.get(player.id) ?? 0) === fewest
    );
  }

  const shortlist = pool.slice(0, OPEN_SLOT_PICK_WINDOW);
  if (shortlist.length === 0) return null;

  const history =
    input.teammateHistory ?? { counts: new Map(), mostRecent: new Map() };
  const teammate = input.remaining.find((player) => player.team === input.team);
  const teamSkill = (team: number) =>
    input.remaining
      .filter((player) => player.team === team)
      .reduce((total, player) => total + matchSkill(player), 0);
  const otherTeam = input.team === 1 ? 2 : 1;

  const ranked = shortlist.map((player) => ({
    player,
    immediateRepeat: teammate
      ? Number(history.mostRecent.get(teammate.id) === player.id) +
        Number(history.mostRecent.get(player.id) === teammate.id)
      : 0,
    usage: teammate
      ? history.counts.get(pairKey(teammate.id, player.id)) ?? 0
      : 0,
    difference: Math.abs(
      teamSkill(input.team) + matchSkill(player) - teamSkill(otherTeam)
    ),
  }));
  ranked.sort(
    (left, right) =>
      left.immediateRepeat - right.immediateRepeat ||
      left.usage - right.usage ||
      left.difference - right.difference ||
      left.player.queuePosition - right.player.queuePosition
  );
  return ranked[0].player;
}

type ReturningPlayer = { participantId: string; queuePositionBefore: number };

// Puts players back in the spot they held before the match, so leaving a
// match never costs a player their place in line.
async function returnPlayersToQueue(
  tx: OpenPlayTx,
  sessionId: string,
  players: ReturningPlayer[],
  fromStatus: "STAGED" | "PLAYING",
  now: Date
): Promise<void> {
  for (const player of players) {
    await tx.openPlayParticipant.updateMany({
      where: {
        id: player.participantId,
        sessionId,
        status: fromStatus,
      },
      data: {
        status: "QUEUED",
        queuePosition: player.queuePositionBefore,
        queuedAt: now,
      },
    });
  }
}

async function cancelStagedGames(
  tx: OpenPlayTx,
  sessionId: string,
  games: StagedGameWithPlayers[]
): Promise<void> {
  const now = new Date();
  for (const game of games) {
    await returnPlayersToQueue(tx, sessionId, game.players, "STAGED", now);
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

type MatchmakingContext = {
  completedGames: CompletedGameForHistory[];
  teammateHistory: TeammateHistory;
};

async function loadMatchmakingContext(
  tx: OpenPlayTx,
  sessionId: string
): Promise<MatchmakingContext> {
  const completedGames = await tx.openPlayGame.findMany({
    where: { sessionId, status: "COMPLETED" },
    select: {
      sequence: true,
      completedAt: true,
      players: { select: { participantId: true, team: true } },
    },
  });
  return { completedGames, teammateHistory: buildTeammateHistory(completedGames) };
}

async function loadQueuedCandidates(
  tx: OpenPlayTx,
  sessionId: string
): Promise<MatchCandidate[]> {
  const rows = await tx.openPlayParticipant.findMany({
    where: {
      sessionId,
      status: "QUEUED",
      queuePosition: { not: null },
    },
    orderBy: [{ queuePosition: "asc" }, { id: "asc" }],
    select: {
      id: true,
      queuePosition: true,
      skillLevel: true,
      duprRating: true,
      lastResult: true,
      pairId: true,
    },
  });
  return rows.flatMap((row) =>
    row.queuePosition == null
      ? []
      : [
          {
            ...row,
            queuePosition: row.queuePosition,
            duprRating: row.duprRating == null ? null : Number(row.duprRating),
          },
        ]
  ) satisfies MatchCandidate[];
}

// Writes a lineup either into a new Up next match or back into an existing
// one (a rebuild keeps the match's id, sequence, and any reserved court).
async function stageTeams(
  tx: OpenPlayTx,
  input: {
    sessionId: string;
    mode: OpenPlayMatchingMode;
    createdById: string | null;
    target: { kind: "new"; sequence: number } | { kind: "existing"; gameId: string };
    teams: MatchTeam[];
    markAutomatic?: boolean;
  }
): Promise<string> {
  let gameId: string;
  if (input.target.kind === "new") {
    const game = await tx.openPlayGame.create({
      data: {
        sessionId: input.sessionId,
        sequence: input.target.sequence,
        matchingMode: input.mode,
        createdById: input.createdById,
        players: { create: input.teams },
      },
      select: { id: true },
    });
    gameId = game.id;
  } else {
    gameId = input.target.gameId;
    await tx.openPlayGamePlayer.createMany({
      data: input.teams.map((team) => ({ ...team, gameId })),
    });
    if (input.markAutomatic ?? true) {
      await tx.openPlayGame.update({
        where: { id: gameId },
        data: { selectionMethod: "AUTOMATIC", matchingMode: input.mode },
      });
    }
  }
  await tx.openPlayParticipant.updateMany({
    where: {
      id: { in: input.teams.map((team) => team.participantId) },
      sessionId: input.sessionId,
      status: "QUEUED",
    },
    data: { status: "STAGED", queuePosition: null, queuedAt: null },
  });
  return gameId;
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
      upNextSlots: true,
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
  // One staged match per free court, plus the organizer's Up next boxes.
  const targetCount = availableCourtSlots + session.upNextSlots;
  let staged = await tx.openPlayGame.findMany({
    where: { sessionId: session.id, status: "STAGED" },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      courtId: true,
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
    // Only automatic Up next matches are trimmed; a match already announced
    // on a court, or one the organizer picked by hand, stays.
    const excess = staged.length - targetCount;
    const removable = staged
      .filter(
        (game) => game.selectionMethod === "AUTOMATIC" && game.courtId === null
      )
      .slice(-excess);
    await cancelStagedGames(tx, session.id, removable);
    const removedIds = new Set(removable.map((game) => game.id));
    staged = staged.filter((game) => !removedIds.has(game.id));
  }

  const [context, latestGame] = await Promise.all([
    loadMatchmakingContext(tx, session.id),
    tx.openPlayGame.findFirst({
      where: { sessionId: session.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    }),
  ]);
  const createdGameIds: string[] = [];
  let nextSequence = (latestGame?.sequence ?? 0) + 1;

  while (staged.length + createdGameIds.length < targetCount) {
    const teams = chooseAutomaticMatch({
      mode: session.matchingMode,
      queued: await loadQueuedCandidates(tx, session.id),
      teammateHistory: context.teammateHistory,
      completedGames: context.completedGames,
    });
    if (!teams) break;

    createdGameIds.push(
      await stageTeams(tx, {
        sessionId: session.id,
        mode: session.matchingMode,
        createdById: input.createdById,
        target: { kind: "new", sequence: nextSequence },
        teams,
      })
    );
    nextSequence += 1;
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

// Takes a player out of an upcoming or live match and puts them back in line
// at their earlier spot. The match keeps its other players and an open spot;
// a match left with nobody is cancelled, which frees its court. Nothing is
// counted for the player because the match never completes with them in it.
export async function returnOpenPlayParticipantToQueue(
  tx: OpenPlayTx,
  input: { sessionId: string; participantId: string }
): Promise<{ gameId: string; cancelled: boolean } | null> {
  const participant = await tx.openPlayParticipant.findFirst({
    where: { id: input.participantId, sessionId: input.sessionId },
    select: { id: true, status: true },
  });
  if (!participant) return null;
  if (participant.status !== "STAGED" && participant.status !== "PLAYING") {
    return null;
  }
  const gameStatus = participant.status === "STAGED" ? "STAGED" : "ACTIVE";
  const game = await tx.openPlayGame.findFirst({
    where: {
      sessionId: input.sessionId,
      status: gameStatus,
      players: { some: { participantId: participant.id } },
    },
    select: {
      id: true,
      players: { select: { participantId: true, queuePositionBefore: true } },
    },
  });
  const row = game?.players.find(
    (player) => player.participantId === participant.id
  );
  if (!game || !row) return null;

  const now = new Date();
  await tx.openPlayGamePlayer.delete({
    where: {
      gameId_participantId: { gameId: game.id, participantId: participant.id },
    },
  });
  await returnPlayersToQueue(
    tx,
    input.sessionId,
    [row],
    participant.status,
    now
  );
  const cancelled = game.players.length <= 1;
  if (cancelled) {
    await tx.openPlayGame.updateMany({
      where: { id: game.id, sessionId: input.sessionId, status: gameStatus },
      data: { status: "CANCELLED", cancelledAt: now },
    });
  }
  return { gameId: game.id, cancelled };
}

export type RebuildOutcome = {
  rebuilt: number;
  unchanged: number;
  cleared: number;
};

// Rebuilds upcoming matches in place. Every box's players go back in line
// first, so each box draws from the whole waiting queue; boxes keep their id,
// sequence, and any reserved court. A box that can't be filled is cancelled
// and shows as an empty Up next slot.
export async function rebuildOpenPlayUpNextGames(
  tx: OpenPlayTx,
  input: { sessionId: string; gameIds: string[]; createdById: string | null }
): Promise<RebuildOutcome> {
  const outcome: RebuildOutcome = { rebuilt: 0, unchanged: 0, cleared: 0 };
  const session = await tx.openPlaySession.findUnique({
    where: { id: input.sessionId },
    select: { status: true, matchingMode: true },
  });
  if (!session || session.status !== "ACTIVE" || input.gameIds.length === 0) {
    return outcome;
  }
  const games = await tx.openPlayGame.findMany({
    where: {
      id: { in: input.gameIds },
      sessionId: input.sessionId,
      status: "STAGED",
    },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      selectionMethod: true,
      players: {
        orderBy: { slot: "asc" },
        select: {
          participantId: true,
          team: true,
          slot: true,
          queuePositionBefore: true,
        },
      },
    },
  });
  const now = new Date();
  for (const game of games) {
    await returnPlayersToQueue(tx, input.sessionId, game.players, "STAGED", now);
    await tx.openPlayGamePlayer.deleteMany({ where: { gameId: game.id } });
  }

  const context = await loadMatchmakingContext(tx, input.sessionId);
  for (const game of games) {
    const choice = chooseRebuiltMatch({
      mode: session.matchingMode,
      queued: await loadQueuedCandidates(tx, input.sessionId),
      previous: game.players,
      teammateHistory: context.teammateHistory,
      completedGames: context.completedGames,
    });
    if (choice.kind === "NOT_ENOUGH_PLAYERS") {
      await tx.openPlayGame.update({
        where: { id: game.id },
        data: { status: "CANCELLED", cancelledAt: now },
      });
      outcome.cleared += 1;
      continue;
    }
    const teams =
      choice.kind === "NEW"
        ? choice.teams
        : game.players.map((player) => ({
            participantId: player.participantId,
            team: player.team as 1 | 2,
            slot: player.slot as 1 | 2 | 3 | 4,
            queuePositionBefore: player.queuePositionBefore,
          }));
    await stageTeams(tx, {
      sessionId: input.sessionId,
      mode: session.matchingMode,
      createdById: input.createdById,
      target: { kind: "existing", gameId: game.id },
      teams,
      markAutomatic: choice.kind === "NEW",
    });
    if (choice.kind === "NEW") outcome.rebuilt += 1;
    else outcome.unchanged += 1;
  }
  return outcome;
}

export async function getOpenPlayWorkspace(
  required: "VIEW" | "MANAGE" = "VIEW"
): Promise<PartnerWorkspace | null> {
  const workspace = await getPartnerWorkspace();
  if (!workspace || !hasStaffAccess(workspace, "openPlay", required)) {
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
    upNextSlots: session.upNextSlots,
    updatedAt: session.updatedAt.toISOString(),
    courtAdd: null,
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
      duprRating:
        participant.duprRating == null ? null : Number(participant.duprRating),
      source: participant.source,
      status: participant.status,
      lastResult: participant.lastResult,
      queuePosition: participant.queuePosition,
      queuedAt: participant.queuedAt?.toISOString() ?? null,
      checkedInAt: participant.checkedInAt?.toISOString() ?? null,
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
  if (!session) return null;
  return { ...toSnapshot(session), courtAdd: await courtAddOptions(session) };
}

// Courts a venue run may add: an Event run only its event's own courts (the
// event reserved them), a Quick run any of the hub's pickleball courts. Courts
// already in this run or live in another BunalQ are left out.
export async function listAddableOpenPlayCourts(
  db: OpenPlayTx,
  session: {
    id: string;
    hubId: string;
    eventId: string | null;
    courtIds: string[];
  }
): Promise<Array<{ id: string; name: string }>> {
  const candidates = session.eventId
    ? (
        await db.eventCourt.findMany({
          where: { eventId: session.eventId },
          select: { court: { select: { id: true, name: true, sortOrder: true, createdAt: true } } },
        })
      )
        .map((row) => row.court)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.createdAt.getTime() - right.createdAt.getTime()
        )
    : await db.court.findMany({
        where: {
          hubId: session.hubId,
          OR: [{ sport: "pickleball" }, { sport: null }],
        },
        orderBy: courtDisplayOrder,
        select: { id: true, name: true },
      });
  const inRun = new Set(session.courtIds);
  const open = candidates.filter((court) => !inRun.has(court.id));
  if (open.length === 0) return [];
  const busy = new Set(
    (
      await db.openPlaySessionCourt.findMany({
        where: {
          courtId: { in: open.map((court) => court.id) },
          active: true,
          session: { status: "ACTIVE", id: { not: session.id } },
        },
        select: { courtId: true },
      })
    ).map((row) => row.courtId)
  );
  return open
    .filter((court) => !busy.has(court.id))
    .map((court) => ({ id: court.id, name: court.name }));
}

async function courtAddOptions(
  session: SessionRecord
): Promise<OpenPlaySnapshot["courtAdd"]> {
  if (session.status === "ENDED") return null;
  if (session.queue.hub.guestBunalQOnly) {
    return {
      kind: "AUTO",
      remaining: Math.max(0, OPEN_PLAY_MAX_COURTS - session.courts.length),
    };
  }
  if (session.courts.length >= OPEN_PLAY_MAX_COURTS) {
    return { kind: "PICK", courts: [] };
  }
  return {
    kind: "PICK",
    courts: await listAddableOpenPlayCourts(prisma, {
      id: session.id,
      hubId: session.queue.hub.id,
      eventId: session.queue.event?.id ?? null,
      courtIds: session.courts.map((court) => court.courtId),
    }),
  };
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
        orderBy: courtDisplayOrder,
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
  operation: "CHECK_IN" | "PAUSE" | "RESUME" | "CHECK_OUT" | "RETURN_TO_QUEUE"
): boolean {
  if (operation === "RETURN_TO_QUEUE") {
    return status === "STAGED" || status === "PLAYING";
  }
  if (operation === "CHECK_IN") {
    return status === "NOT_CHECKED_IN" || status === "CHECKED_OUT";
  }
  if (operation === "PAUSE") {
    return status === "QUEUED" || status === "STAGED";
  }
  if (operation === "RESUME") return status === "PAUSED";
  return ["NOT_CHECKED_IN", "QUEUED", "PAUSED"].includes(status);
}
