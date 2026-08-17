"use server";

import {
  type OpenPlayMatchingMode,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DEFAULT_SKILL_LEVEL, SKILL_LEVELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { manilaToday } from "@/lib/time";
import {
  canTransitionParticipant,
  chooseAutomaticMatch,
  getOpenPlayWorkspace,
  type MatchCandidate,
} from "@/lib/open-play";
import {
  OPEN_PLAY_MODES,
  type OpenPlayActionState,
} from "@/lib/open-play-shared";
import { recordPartnerActivity, type PartnerWorkspace } from "@/lib/staffing";

const idSchema = z.string().trim().min(1).max(64);
const publicIdSchema = z.string().trim().min(1).max(120);
const skillValues = SKILL_LEVELS.map((level) => level.value) as [
  string,
  ...string[],
];
const walkInSchema = z.object({
  sessionId: idSchema,
  publicId: publicIdSchema,
  displayName: z.string().trim().min(1).max(120),
  skillLevel: z.enum(skillValues),
});

type Tx = Prisma.TransactionClient;

function refresh(publicId: string) {
  revalidatePath(`/dashboard/events/${publicId}`);
  revalidatePath(`/dashboard/events/${publicId}/open-play`);
  revalidatePath(`/events/${publicId}/live`);
  revalidatePath("/dashboard/open-play");
}

async function workspaceForManage(): Promise<PartnerWorkspace | null> {
  return getOpenPlayWorkspace("MANAGE");
}

async function ownedSession(
  sessionId: string,
  workspace: PartnerWorkspace
) {
  return prisma.openPlaySession.findFirst({
    where: { id: sessionId, event: { hub: { ownerId: workspace.partnerId } } },
    select: { id: true, event: { select: { publicId: true } } },
  });
}

async function lockSession(tx: Tx, sessionId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "OpenPlaySession" WHERE "id" = ${sessionId} FOR UPDATE`
  );
  return tx.openPlaySession.findUnique({
    where: { id: sessionId },
    include: {
      event: {
        select: {
          id: true,
          publicId: true,
          date: true,
          sport: true,
          status: true,
          hub: { select: { ownerId: true } },
        },
      },
      courts: true,
    },
  });
}

async function audit(
  workspace: PartnerWorkspace,
  action: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue
) {
  await recordPartnerActivity({
    workspace,
    action,
    targetType: "OpenPlaySession",
    targetId,
    metadata,
  });
}

async function syncRosterRows(tx: Tx, sessionId: string, eventId: string) {
  const [registrations, organizerGuests] = await Promise.all([
    tx.eventRegistration.findMany({
      where: { eventId, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            playerName: true,
            skillLevel: true,
            privateProfile: true,
          },
        },
        guests: {
          where: { status: "CONFIRMED" },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    tx.eventOrganizerGuest.findMany({
      where: { eventId, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  await tx.openPlayParticipant.createMany({
    data: [
      ...registrations.map((registration) => ({
        sessionId,
        source: "REGISTERED_PLAYER" as const,
        userId: registration.user.id,
        eventRegistrationId: registration.id,
        displayName:
          registration.user.privateProfile
            ? "Private player"
            : registration.user.playerName ?? registration.user.name ?? "Player",
        skillLevel: registration.user.skillLevel,
      })),
      ...registrations.flatMap((registration) =>
        registration.guests.map((guest) => ({
          sessionId,
          source: "REGISTRATION_GUEST" as const,
          eventGuestSlotId: guest.id,
          displayName: guest.name,
          skillLevel: DEFAULT_SKILL_LEVEL,
        }))
      ),
      ...organizerGuests.map((guest) => ({
        sessionId,
        source: "ORGANIZER_GUEST" as const,
        organizerGuestId: guest.id,
        displayName: guest.name,
        skillLevel: DEFAULT_SKILL_LEVEL,
      })),
    ],
    skipDuplicates: true,
  });

  const validRegistrationIds = new Set(registrations.map((row) => row.id));
  const validGuestIds = new Set(
    registrations.flatMap((registration) => registration.guests.map((guest) => guest.id))
  );
  const validOrganizerIds = new Set(organizerGuests.map((row) => row.id));
  const sourced = await tx.openPlayParticipant.findMany({
    where: { sessionId, source: { not: "WALK_IN" } },
    select: {
      id: true,
      source: true,
      eventRegistrationId: true,
      eventGuestSlotId: true,
      organizerGuestId: true,
      status: true,
    },
  });
  const invalid = sourced.filter((participant) => {
    if (participant.status !== "NOT_CHECKED_IN") return false;
    if (participant.source === "REGISTERED_PLAYER") {
      return !participant.eventRegistrationId ||
        !validRegistrationIds.has(participant.eventRegistrationId);
    }
    if (participant.source === "REGISTRATION_GUEST") {
      return !participant.eventGuestSlotId ||
        !validGuestIds.has(participant.eventGuestSlotId);
    }
    return !participant.organizerGuestId ||
      !validOrganizerIds.has(participant.organizerGuestId);
  });
  if (invalid.length > 0) {
    await tx.openPlayParticipant.updateMany({
      where: { id: { in: invalid.map((participant) => participant.id) } },
      data: { status: "CHECKED_OUT" },
    });
  }
}

export async function prepareOpenPlayAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const parsed = publicIdSchema.safeParse(String(formData.get("publicId") ?? ""));
  if (!parsed.success) return { message: "Event not found." };

  const result = await prisma.$transaction(async (tx) => {
    const ownedEvent = await tx.event.findFirst({
      where: { publicId: parsed.data, hub: { ownerId: workspace.partnerId } },
      select: { id: true },
    });
    if (!ownedEvent) return { kind: "missing" as const };
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${ownedEvent.id} FOR UPDATE`
    );
    const event = await tx.event.findUnique({
      where: { id: ownedEvent.id },
      include: {
        openPlaySession: { select: { id: true } },
        courts: { include: { court: { select: { id: true, createdAt: true } } } },
      },
    });
    if (!event) return { kind: "missing" as const };
    if (event.status !== "PUBLISHED" || event.sport !== "pickleball") {
      return { kind: "unavailable" as const };
    }
    let sessionId = event.openPlaySession?.id;
    if (!sessionId) {
      const courts = [...event.courts].sort(
        (left, right) => left.court.createdAt.getTime() - right.court.createdAt.getTime()
      );
      const session = await tx.openPlaySession.create({
        data: {
          eventId: event.id,
          createdById: workspace.actorId,
          courts: {
            create: courts.map((row, position) => ({
              courtId: row.court.id,
              position,
            })),
          },
        },
        select: { id: true },
      });
      sessionId = session.id;
    }
    await syncRosterRows(tx, sessionId, event.id);
    return { kind: "ready" as const, sessionId };
  });
  if (result.kind === "missing") return { message: "Event not found." };
  if (result.kind === "unavailable") {
    return { message: "Open Play requires a published pickleball event." };
  }
  await audit(workspace, "OPEN_PLAY_PREPARED", result.sessionId);
  refresh(parsed.data);
  return { success: "Open Play is ready." };
}

export async function syncOpenPlayRosterAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") throw new Error("SESSION_ENDED");
    await syncRosterRows(tx, session.id, session.event.id);
  }).catch((error) => {
    if (error instanceof Error && error.message === "SESSION_ENDED") return;
    throw error;
  });
  refresh(owned.event.publicId);
  return { success: "Roster refreshed." };
}

export async function addOpenPlayWalkInAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const parsed = walkInSchema.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    publicId: String(formData.get("publicId") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? DEFAULT_SKILL_LEVEL),
  });
  if (!parsed.success) return { message: "Enter a name and skill level." };
  const owned = await ownedSession(parsed.data.sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const participant = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, parsed.data.sessionId);
    if (!session || session.status === "ENDED") return null;
    return tx.openPlayParticipant.create({
      data: {
        sessionId: session.id,
        source: "WALK_IN",
        displayName: parsed.data.displayName,
        skillLevel: parsed.data.skillLevel,
      },
      select: { id: true },
    });
  });
  if (!participant) return { message: "This session has ended." };
  await audit(workspace, "OPEN_PLAY_WALK_IN_ADDED", parsed.data.sessionId, {
    participantId: participant.id,
  });
  refresh(owned.event.publicId);
  return { success: `${parsed.data.displayName} was added.` };
}

async function participantTransition(
  workspace: PartnerWorkspace,
  sessionId: string,
  participantId: string,
  operation: "CHECK_IN" | "PAUSE" | "RESUME" | "CHECK_OUT"
) {
  return prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED" || session.event.hub.ownerId !== workspace.partnerId) {
      return { message: "Open Play session not found or ended." };
    }
    const participant = await tx.openPlayParticipant.findFirst({
      where: { id: participantId, sessionId },
      select: { id: true, status: true },
    });
    if (!participant || !canTransitionParticipant(participant.status, operation)) {
      return { message: "That player cannot make this transition right now." };
    }
    if (operation === "CHECK_IN" || operation === "RESUME") {
      const position = session.nextQueuePosition + 1;
      await tx.openPlaySession.update({
        where: { id: session.id },
        data: { nextQueuePosition: position },
      });
      await tx.openPlayParticipant.update({
        where: { id: participant.id },
        data: {
          status: "QUEUED",
          queuePosition: position,
          queuedAt: new Date(),
          ...(operation === "CHECK_IN" ? { checkedInAt: new Date() } : {}),
        },
      });
    } else {
      await tx.openPlayParticipant.update({
        where: { id: participant.id },
        data: {
          status: operation === "PAUSE" ? "PAUSED" : "CHECKED_OUT",
          queuePosition: null,
          queuedAt: null,
        },
      });
    }
    return { publicId: session.event.publicId };
  });
}

async function transitionAction(
  formData: FormData,
  operation: "CHECK_IN" | "PAUSE" | "RESUME" | "CHECK_OUT"
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  if (!sessionId || !participantId) return { message: "Player not found." };
  const result = await participantTransition(workspace, sessionId, participantId, operation);
  if ("message" in result) return result;
  await audit(workspace, `OPEN_PLAY_${operation}`, sessionId, { participantId });
  refresh(result.publicId);
  return { success: "Player updated." };
}

export async function checkInOpenPlayParticipantAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return transitionAction(formData, "CHECK_IN"); }
export async function pauseOpenPlayParticipantAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return transitionAction(formData, "PAUSE"); }
export async function resumeOpenPlayParticipantAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return transitionAction(formData, "RESUME"); }
export async function checkOutOpenPlayParticipantAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return transitionAction(formData, "CHECK_OUT"); }

export async function startOpenPlaySessionAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const result = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.event.hub.ownerId !== workspace.partnerId) return "missing";
    if (session.status !== "SETUP") return "state";
    if (session.event.status !== "PUBLISHED" || session.event.date !== manilaToday()) return "date";
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: { status: "ACTIVE", startedAt: new Date() },
    });
    return "started";
  });
  if (result === "date") return { message: "The session can start only on the published Event date." };
  if (result !== "started") return { message: "The session cannot be started." };
  await audit(workspace, "OPEN_PLAY_STARTED", sessionId);
  refresh(owned.event.publicId);
  return { success: "Open Play started." };
}

export async function changeOpenPlayModeAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const mode = String(formData.get("mode") ?? "") as OpenPlayMatchingMode;
  if (!OPEN_PLAY_MODES.includes(mode)) return { message: "Choose a valid matching mode." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const changed = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    await tx.openPlaySession.update({ where: { id: session.id }, data: { matchingMode: mode } });
    return true;
  });
  if (!changed) return { message: "This session has ended." };
  await audit(workspace, "OPEN_PLAY_MODE_CHANGED", sessionId, { mode });
  refresh(owned.event.publicId);
  return { success: "Matching mode updated." };
}

export async function pairOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const firstId = String(formData.get("firstId") ?? "");
  const secondId = String(formData.get("secondId") ?? "");
  if (!sessionId || !firstId || !secondId || firstId === secondId) {
    return { message: "Choose two different players." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const result = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    const participants = await tx.openPlayParticipant.findMany({
      where: { id: { in: [firstId, secondId] }, sessionId },
      select: { id: true, status: true, pairId: true },
    });
    if (
      participants.length !== 2 ||
      participants.some((participant) => ["STAGED", "PLAYING"].includes(participant.status))
    ) return false;
    const oldPairIds = participants.flatMap((participant) => participant.pairId ? [participant.pairId] : []);
    await tx.openPlayParticipant.updateMany({
      where: { sessionId, pairId: { in: oldPairIds } },
      data: { pairId: null },
    });
    if (oldPairIds.length > 0) await tx.openPlayPair.deleteMany({ where: { id: { in: oldPairIds } } });
    const pair = await tx.openPlayPair.create({ data: { sessionId }, select: { id: true } });
    await tx.openPlayParticipant.updateMany({
      where: { id: { in: [firstId, secondId] }, sessionId },
      data: { pairId: pair.id },
    });
    return true;
  });
  if (!result) return { message: "Those players cannot be paired right now." };
  await audit(workspace, "OPEN_PLAY_PAIR_CREATED", sessionId, { firstId, secondId });
  refresh(owned.event.publicId);
  return { success: "Fixed partners saved." };
}

export async function unpairOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const pairId = String(formData.get("pairId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  await prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const pair = await tx.openPlayPair.findFirst({ where: { id: pairId, sessionId } });
    if (!pair) return;
    await tx.openPlayParticipant.updateMany({ where: { sessionId, pairId }, data: { pairId: null } });
    await tx.openPlayPair.delete({ where: { id: pairId } });
  });
  refresh(owned.event.publicId);
  return { success: "Pair removed." };
}

export async function toggleOpenPlayCourtAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const result = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return "ended";
    const court = session.courts.find((item) => item.courtId === courtId);
    if (!court) return "missing";
    if (!active) {
      const occupied = await tx.openPlayGame.count({
        where: { sessionId, courtId, status: { in: ["STAGED", "ACTIVE"] } },
      });
      if (occupied > 0) return "occupied";
    }
    await tx.openPlaySessionCourt.update({
      where: { sessionId_courtId: { sessionId, courtId } },
      data: { active },
    });
    return "updated";
  });
  if (result === "occupied") return { message: "Finish or clear this court's match before pausing it." };
  if (result !== "updated") return { message: "Court cannot be updated." };
  refresh(owned.event.publicId);
  return { success: active ? "Court resumed." : "Court paused." };
}

function teammateHistory(games: Array<{
  winningTeam: number | null;
  players: Array<{ participantId: string; team: number }>;
}>) {
  const counts = new Map<string, number>();
  for (const game of games) {
    if (!game.winningTeam) continue;
    for (const team of [1, 2]) {
      const members = game.players.filter((player) => player.team === team);
      if (members.length !== 2) continue;
      const key = [members[0].participantId, members[1].participantId].sort().join(":");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

export async function stageOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const result = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return { kind: "inactive" as const };
    const court = session.courts.find((item) => item.courtId === courtId && item.active);
    if (!court) return { kind: "court" as const };
    const occupied = await tx.openPlayGame.count({
      where: { sessionId, courtId, status: { in: ["STAGED", "ACTIVE"] } },
    });
    if (occupied > 0) return { kind: "occupied" as const };
    const [queuedRows, completedGames, latestGame] = await Promise.all([
      tx.openPlayParticipant.findMany({
        where: { sessionId, status: "QUEUED", queuePosition: { not: null } },
        orderBy: { queuePosition: "asc" },
        select: { id: true, queuePosition: true, skillLevel: true, lastResult: true, pairId: true },
      }),
      tx.openPlayGame.findMany({
        where: { sessionId, status: "COMPLETED" },
        select: { winningTeam: true, players: { select: { participantId: true, team: true } } },
      }),
      tx.openPlayGame.findFirst({ where: { sessionId }, orderBy: { sequence: "desc" }, select: { sequence: true } }),
    ]);
    const queued = queuedRows.flatMap((row) =>
      row.queuePosition == null ? [] : [{ ...row, queuePosition: row.queuePosition }]
    ) satisfies MatchCandidate[];
    const teams = chooseAutomaticMatch({
      mode: session.matchingMode,
      queued,
      teammateCounts: teammateHistory(completedGames),
    });
    if (!teams) return { kind: "players" as const };
    const game = await tx.openPlayGame.create({
      data: {
        sessionId,
        courtId,
        sequence: (latestGame?.sequence ?? 0) + 1,
        matchingMode: session.matchingMode,
        createdById: workspace.actorId,
        players: { create: teams },
      },
      select: { id: true },
    });
    await tx.openPlayParticipant.updateMany({
      where: { id: { in: teams.map((team) => team.participantId) }, sessionId, status: "QUEUED" },
      data: { status: "STAGED", queuePosition: null, queuedAt: null },
    });
    return { kind: "staged" as const, gameId: game.id };
  });
  if (result.kind === "players") return { message: "There are not enough eligible players for this matching mode." };
  if (result.kind === "occupied") return { message: "This court already has a match." };
  if (result.kind !== "staged") return { message: "A match cannot be staged on this court." };
  await audit(workspace, "OPEN_PLAY_MATCH_STAGED", sessionId, { gameId: result.gameId });
  refresh(owned.event.publicId);
  return { success: "Up Next match staged." };
}

export async function startOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const started = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return false;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "STAGED" },
      include: { players: { select: { participantId: true } } },
    });
    if (!game || game.players.length !== 4) return false;
    await tx.openPlayGame.update({ where: { id: game.id }, data: { status: "ACTIVE", startedAt: new Date() } });
    await tx.openPlayParticipant.updateMany({
      where: { id: { in: game.players.map((player) => player.participantId) }, status: "STAGED" },
      data: { status: "PLAYING" },
    });
    return true;
  });
  if (!started) return { message: "This match cannot be started." };
  refresh(owned.event.publicId);
  return { success: "Match started." };
}

export async function editStagedOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const participantIds = [1, 2, 3, 4].map((slot) =>
    String(formData.get(`player${slot}`) ?? "")
  );
  if (participantIds.some((id) => !id) || new Set(participantIds).size !== 4) {
    return { message: "Choose four different eligible players." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const edited = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return false;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "STAGED" },
      include: { players: true },
    });
    if (!game) return false;
    const currentIds = new Set(game.players.map((slot) => slot.participantId));
    const participants = await tx.openPlayParticipant.findMany({
      where: { id: { in: participantIds }, sessionId },
      select: { id: true, status: true, queuePosition: true },
    });
    if (
      participants.length !== 4 ||
      participants.some(
        (participant) =>
          participant.status !== "QUEUED" &&
          !(participant.status === "STAGED" && currentIds.has(participant.id))
      )
    ) return false;

    const oldPositions = new Map(
      game.players.map((slot) => [slot.participantId, slot.queuePositionBefore])
    );
    const chosen = new Set(participantIds);
    for (const slot of game.players) {
      if (!chosen.has(slot.participantId)) {
        await tx.openPlayParticipant.update({
          where: { id: slot.participantId },
          data: {
            status: "QUEUED",
            queuePosition: slot.queuePositionBefore,
            queuedAt: new Date(),
          },
        });
      }
    }
    await tx.openPlayGamePlayer.deleteMany({ where: { gameId: game.id } });
    await tx.openPlayGamePlayer.createMany({
      data: participantIds.map((participantId, index) => {
        const participant = participants.find((row) => row.id === participantId)!;
        return {
          gameId: game.id,
          participantId,
          team: index < 2 ? 1 : 2,
          slot: index + 1,
          queuePositionBefore:
            oldPositions.get(participantId) ?? participant.queuePosition!,
        };
      }),
    });
    await tx.openPlayParticipant.updateMany({
      where: { id: { in: participantIds }, sessionId },
      data: { status: "STAGED", queuePosition: null, queuedAt: null },
    });
    await tx.openPlayGame.update({
      where: { id: game.id },
      data: { selectionMethod: "MANUAL" },
    });
    return true;
  });
  if (!edited) return { message: "The staged match could not be edited." };
  await audit(workspace, "OPEN_PLAY_MATCH_EDITED", sessionId, { gameId });
  refresh(owned.event.publicId);
  return { success: "Up Next teams updated." };
}

export async function recordOpenPlayWinnerAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const winningTeam = Number(formData.get("winningTeam"));
  if (winningTeam !== 1 && winningTeam !== 2) return { message: "Choose the winning team." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const completed = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return false;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "ACTIVE" },
      include: { players: true },
    });
    if (!game || game.players.length !== 4) return false;
    let next = session.nextQueuePosition;
    for (const slot of game.players.sort((left, right) => left.slot - right.slot)) {
      next += 1;
      await tx.openPlayParticipant.update({
        where: { id: slot.participantId },
        data: {
          status: "QUEUED",
          queuePosition: next,
          queuedAt: new Date(),
          lastResult: slot.team === winningTeam ? "WIN" : "LOSS",
        },
      });
    }
    await tx.openPlaySession.update({ where: { id: session.id }, data: { nextQueuePosition: next } });
    await tx.openPlayGame.update({
      where: { id: game.id },
      data: { status: "COMPLETED", winningTeam, completedAt: new Date() },
    });
    return true;
  });
  if (!completed) return { message: "This result was already recorded or the match is unavailable." };
  await audit(workspace, "OPEN_PLAY_RESULT_RECORDED", sessionId, { gameId, winningTeam });
  refresh(owned.event.publicId);
  return { success: "Winner recorded." };
}

export async function undoOpenPlayResultAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const undone = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return false;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "COMPLETED" },
      include: { players: { include: { participant: { select: { status: true } } } } },
    });
    if (!game || game.players.some((slot) => slot.participant.status !== "QUEUED")) return false;
    const newerStarted = await tx.openPlayGame.count({
      where: { sessionId, courtId: game.courtId, sequence: { gt: game.sequence }, status: { in: ["ACTIVE", "COMPLETED"] } },
    });
    if (newerStarted > 0) return false;
    const staged = await tx.openPlayGame.findFirst({
      where: { sessionId, courtId: game.courtId, sequence: { gt: game.sequence }, status: "STAGED" },
      include: { players: true },
    });
    if (staged) {
      for (const slot of staged.players) {
        await tx.openPlayParticipant.update({
          where: { id: slot.participantId },
          data: { status: "QUEUED", queuePosition: slot.queuePositionBefore, queuedAt: new Date() },
        });
      }
      await tx.openPlayGame.update({ where: { id: staged.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    }
    for (const slot of game.players) {
      const previous = await tx.openPlayGame.findFirst({
        where: {
          sessionId,
          status: "COMPLETED",
          sequence: { lt: game.sequence },
          players: { some: { participantId: slot.participantId } },
        },
        orderBy: { sequence: "desc" },
        include: { players: { where: { participantId: slot.participantId }, select: { team: true } } },
      });
      const previousResult = !previous?.winningTeam || previous.players.length === 0
        ? "UNCLASSIFIED"
        : previous.players[0].team === previous.winningTeam ? "WIN" : "LOSS";
      await tx.openPlayParticipant.update({
        where: { id: slot.participantId },
        data: {
          status: "PLAYING",
          queuePosition: null,
          queuedAt: null,
          lastResult: previousResult,
        },
      });
    }
    await tx.openPlayGame.update({
      where: { id: game.id },
      data: { status: "ACTIVE", winningTeam: null, completedAt: null },
    });
    return true;
  });
  if (!undone) return { message: "This result can no longer be undone." };
  await audit(workspace, "OPEN_PLAY_RESULT_UNDONE", sessionId, { gameId });
  refresh(owned.event.publicId);
  return { success: "Result undone; the match is active again." };
}

export async function endOpenPlaySessionAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "Open Play manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "Open Play session not found." };
  const ended = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    await tx.openPlayGame.updateMany({
      where: { sessionId, status: { in: ["STAGED", "ACTIVE"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.openPlayParticipant.updateMany({
      where: { sessionId, status: { not: "CHECKED_OUT" } },
      data: { status: "CHECKED_OUT", queuePosition: null, queuedAt: null },
    });
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: { status: "ENDED", endedAt: new Date() },
    });
    return true;
  });
  if (!ended) return { message: "This session has already ended." };
  await audit(workspace, "OPEN_PLAY_ENDED", sessionId);
  refresh(owned.event.publicId);
  return { success: "Open Play ended." };
}
