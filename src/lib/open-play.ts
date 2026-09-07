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
import type { OpenPlaySnapshot } from "@/lib/open-play-shared";

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

function balancedTeams(
  players: MatchCandidate[],
  teammateHistory: TeammateHistory
): MatchTeam[] {
  const arrangements = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ] as const;
  const ranked = arrangements.map((teams, index) => {
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
    return {
      teams,
      index,
      difference: Math.abs(first - second),
      immediateRepeats,
      totalUsage: usages[0] + usages[1],
      maximumUsage: Math.max(...usages),
    };
  });
  ranked.sort(
    (left, right) =>
      left.immediateRepeats - right.immediateRepeats ||
      left.totalUsage - right.totalUsage ||
      left.maximumUsage - right.maximumUsage ||
      left.difference - right.difference ||
      left.index - right.index
  );
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
}): MatchTeam[] | null {
  const queued = [...input.queued].sort(
    (left, right) => left.queuePosition - right.queuePosition
  );
  if (queued.length < 4) return null;

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
  } else {
    selected = queued.slice(0, 4);
  }

  return balancedTeams(
    selected,
    input.teammateHistory ?? { counts: new Map(), mostRecent: new Map() }
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
    },
  });
  if (!session || session.status !== "ACTIVE") {
    return { createdGameIds: [], assignedGameIds: [] };
  }

  const targetCount = session.courts.filter((court) => court.active).length;
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
      hub: { select: { id: true, ownerId: true, name: true, address: true } },
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
  const activeCourtCount = Math.max(
    1,
    session.courts.filter((court) => court.active).length
  );
  const duration = gameDurationMinutes(session);
  const queue = session.participants.filter(
    (participant) => participant.status === "QUEUED"
  );
  const waits = new Map(
    queue.map((participant, index) => [
      participant.id,
      (Math.floor(index / (activeCourtCount * 4)) + 1) * duration,
    ])
  );
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
    select: {
      id: true,
      updatedAt: true,
      matchingMode: true,
      courts: {
        orderBy: { position: "asc" },
        select: { courtId: true, active: true },
      },
      games: {
        where: { status: { in: ["STAGED", "ACTIVE"] } },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          courtId: true,
          status: true,
          selectionMethod: true,
          updatedAt: true,
        },
      },
      participants: {
        orderBy: { id: "asc" },
        select: { id: true, status: true, updatedAt: true },
      },
    },
  });
  if (!session) return null;
  return JSON.stringify({
    sessionId: session.id,
    updatedAt: session.updatedAt.toISOString(),
    matchingMode: session.matchingMode,
    courts: session.courts,
    games: session.games.map((game) => ({
      ...game,
      updatedAt: game.updatedAt.toISOString(),
    })),
    participants: session.participants.map((participant) => ({
      id: participant.id,
      status: participant.status,
      updatedAt: participant.updatedAt.toISOString(),
    })),
  });
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
    where: { sessions: { some: { status: "ACTIVE" } } },
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
    where: { ownerId: partnerId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      courts: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
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
