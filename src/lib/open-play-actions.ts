"use server";

import crypto from "node:crypto";
import {
  type OpenPlayAdmissionMode,
  type OpenPlayMatchingMode,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DEFAULT_SKILL_LEVEL, SKILL_LEVELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSecurityRequestContext } from "@/lib/security-context";
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
const quickQueueSchema = z.object({
  hubId: idSchema,
  title: z.string().trim().min(2).max(120),
  matchingMode: z.enum(OPEN_PLAY_MODES as [OpenPlayMatchingMode, ...OpenPlayMatchingMode[]]),
  admissionMode: z.enum(["APPROVAL_REQUIRED", "INSTANT"]),
  courtIds: z.array(idSchema).min(1).max(12),
});
const participantEditSchema = z.object({
  sessionId: idSchema,
  participantId: idSchema,
  displayName: z.string().trim().min(1).max(120),
  skillLevel: z.enum(skillValues),
});
const publicJoinSchema = z.object({
  publicId: publicIdSchema,
  displayName: z.string().trim().min(1).max(120),
  skillLevel: z.enum(skillValues),
});

type Tx = Prisma.TransactionClient;

function refresh(queuePublicId: string, eventPublicId?: string | null) {
  revalidatePath(`/dashboard/bunalq/${queuePublicId}`);
  revalidatePath(`/q/${queuePublicId}`);
  revalidatePath("/dashboard/bunalq");
  if (eventPublicId) {
    revalidatePath(`/dashboard/events/${eventPublicId}`);
    revalidatePath(`/dashboard/events/${eventPublicId}/bunalq`);
    revalidatePath(`/dashboard/events/${eventPublicId}/open-play`);
    revalidatePath(`/events/${eventPublicId}/live`);
  }
}

async function workspaceForManage(): Promise<PartnerWorkspace | null> {
  return getOpenPlayWorkspace("MANAGE");
}

async function ownedSession(
  sessionId: string,
  workspace: PartnerWorkspace
) {
  return prisma.openPlaySession.findFirst({
    where: { id: sessionId, queue: { hub: { ownerId: workspace.partnerId } } },
    select: {
      id: true,
      queue: {
        select: {
          publicId: true,
          event: { select: { publicId: true } },
        },
      },
    },
  });
}

async function lockSession(tx: Tx, sessionId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "OpenPlaySession" WHERE "id" = ${sessionId} FOR UPDATE`
  );
  return tx.openPlaySession.findUnique({
    where: { id: sessionId },
    include: {
      queue: {
        include: {
          hub: { select: { id: true, ownerId: true } },
          event: {
            select: {
              id: true,
              publicId: true,
              date: true,
              sport: true,
              status: true,
            },
          },
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
  if (!workspace) return { message: "BunalQ manage access is required." };
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
        openPlayQueue: {
          select: {
            id: true,
            publicId: true,
            sessions: {
              orderBy: { runNumber: "desc" },
              take: 1,
              select: { id: true },
            },
          },
        },
        courts: { include: { court: { select: { id: true, createdAt: true } } } },
      },
    });
    if (!event) return { kind: "missing" as const };
    if (event.status !== "PUBLISHED" || event.sport !== "pickleball") {
      return { kind: "unavailable" as const };
    }
    let queueId = event.openPlayQueue?.id;
    let queuePublicId = event.openPlayQueue?.publicId;
    let sessionId = event.openPlayQueue?.sessions[0]?.id;
    if (!queueId) {
      const queue = await tx.openPlayQueue.create({
        data: {
          publicId: crypto.randomBytes(12).toString("base64url"),
          hubId: event.hubId,
          eventId: event.id,
          title: event.title,
          kind: "EVENT",
          createdById: workspace.actorId,
        },
        select: { id: true, publicId: true },
      });
      queueId = queue.id;
      queuePublicId = queue.publicId;
    }
    if (!sessionId) {
      const courts = [...event.courts].sort(
        (left, right) => left.court.createdAt.getTime() - right.court.createdAt.getTime()
      );
      const session = await tx.openPlaySession.create({
        data: {
          queueId,
          runNumber: 1,
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
    return {
      kind: "ready" as const,
      sessionId,
      queuePublicId: queuePublicId!,
      eventPublicId: event.publicId,
    };
  });
  if (result.kind === "missing") return { message: "Event not found." };
  if (result.kind === "unavailable") {
    return { message: "BunalQ requires a published pickleball Event." };
  }
  await audit(workspace, "OPEN_PLAY_PREPARED", result.sessionId);
  refresh(result.queuePublicId, result.eventPublicId);
  return { success: "BunalQ is ready." };
}

export async function syncOpenPlayRosterAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") throw new Error("SESSION_ENDED");
    if (!session.queue.event) throw new Error("EVENT_REQUIRED");
    await syncRosterRows(tx, session.id, session.queue.event.id);
  }).catch((error) => {
    if (error instanceof Error && error.message === "SESSION_ENDED") return;
    throw error;
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Roster refreshed." };
}

export async function addOpenPlayWalkInAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const parsed = walkInSchema.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    publicId: String(formData.get("publicId") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? DEFAULT_SKILL_LEVEL),
  });
  if (!parsed.success) return { message: "Enter a name and skill level." };
  const owned = await ownedSession(parsed.data.sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
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
    if (!session || session.status === "ENDED" || session.queue.hub.ownerId !== workspace.partnerId) {
      return { message: "BunalQ run not found or ended." };
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
    return {
      queuePublicId: session.queue.publicId,
      eventPublicId: session.queue.event?.publicId ?? null,
    };
  });
}

async function transitionAction(
  formData: FormData,
  operation: "CHECK_IN" | "PAUSE" | "RESUME" | "CHECK_OUT"
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  if (!sessionId || !participantId) return { message: "Player not found." };
  const result = await participantTransition(workspace, sessionId, participantId, operation);
  if ("message" in result) return result;
  await audit(workspace, `OPEN_PLAY_${operation}`, sessionId, { participantId });
  refresh(result.queuePublicId, result.eventPublicId);
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
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.queue.hub.ownerId !== workspace.partnerId) return "missing";
    if (session.status !== "SETUP") return "state";
    if (
      session.queue.kind === "EVENT" &&
      (!session.queue.event ||
        session.queue.event.status !== "PUBLISHED" ||
        session.queue.event.date !== manilaToday())
    ) return "date";
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: { status: "ACTIVE", startedAt: new Date() },
    });
    return "started";
  });
  if (result === "date") return { message: "The session can start only on the published Event date." };
  if (result !== "started") return { message: "The session cannot be started." };
  await audit(workspace, "OPEN_PLAY_STARTED", sessionId);
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "BunalQ run started." };
}

export async function changeOpenPlayModeAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const mode = String(formData.get("mode") ?? "") as OpenPlayMatchingMode;
  if (!OPEN_PLAY_MODES.includes(mode)) return { message: "Choose a valid matching mode." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const changed = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    await tx.openPlaySession.update({ where: { id: session.id }, data: { matchingMode: mode } });
    return true;
  });
  if (!changed) return { message: "This session has ended." };
  await audit(workspace, "OPEN_PLAY_MODE_CHANGED", sessionId, { mode });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Matching mode updated." };
}

export async function pairOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const firstId = String(formData.get("firstId") ?? "");
  const secondId = String(formData.get("secondId") ?? "");
  if (!sessionId || !firstId || !secondId || firstId === secondId) {
    return { message: "Choose two different players." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Fixed partners saved." };
}

export async function unpairOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const pairId = String(formData.get("pairId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  await prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const pair = await tx.openPlayPair.findFirst({ where: { id: pairId, sessionId } });
    if (!pair) return;
    await tx.openPlayParticipant.updateMany({ where: { sessionId, pairId }, data: { pairId: null } });
    await tx.openPlayPair.delete({ where: { id: pairId } });
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Pair removed." };
}

export async function toggleOpenPlayCourtAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
    await tx.openPlaySession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
    return "updated";
  });
  if (result === "occupied") return { message: "Finish or clear this court's match before pausing it." };
  if (result !== "updated") return { message: "Court cannot be updated." };
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
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
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Up Next match staged." };
}

export async function startOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Match started." };
}

export async function editStagedOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const participantIds = [1, 2, 3, 4].map((slot) =>
    String(formData.get(`player${slot}`) ?? "")
  );
  if (participantIds.some((id) => !id) || new Set(participantIds).size !== 4) {
    return { message: "Choose four different eligible players." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Up Next teams updated." };
}

export async function recordOpenPlayWinnerAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const winningTeam = Number(formData.get("winningTeam"));
  if (winningTeam !== 1 && winningTeam !== 2) return { message: "Choose the winning team." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Winner recorded." };
}

export async function undoOpenPlayResultAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Result undone; the match is active again." };
}

export async function endOpenPlaySessionAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
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
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "BunalQ run ended." };
}

export async function createQuickQueueAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const parsed = quickQueueSchema.safeParse({
    hubId: String(formData.get("hubId") ?? ""),
    title: String(formData.get("title") ?? ""),
    matchingMode: String(formData.get("matchingMode") ?? "BALANCED"),
    admissionMode: String(formData.get("admissionMode") ?? "APPROVAL_REQUIRED"),
    courtIds: [...new Set(formData.getAll("courtId").map(String))],
  });
  if (!parsed.success) {
    return { message: "Choose a hub, at least one court, and a queue name." };
  }
  const hub = await prisma.hub.findFirst({
    where: { id: parsed.data.hubId, ownerId: workspace.partnerId },
    select: {
      id: true,
      courts: {
        where: { id: { in: parsed.data.courtIds } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      },
    },
  });
  if (!hub || hub.courts.length !== parsed.data.courtIds.length) {
    return { message: "One or more selected courts are unavailable." };
  }
  const publicId = crypto.randomBytes(12).toString("base64url");
  const session = await prisma.openPlaySession.create({
    data: {
      queue: {
        create: {
          publicId,
          hubId: hub.id,
          title: parsed.data.title,
          kind: "QUICK",
          admissionMode: parsed.data.admissionMode,
          createdById: workspace.actorId,
        },
      },
      runNumber: 1,
      status: "ACTIVE",
      matchingMode: parsed.data.matchingMode,
      createdById: workspace.actorId,
      startedAt: new Date(),
      courts: {
        create: hub.courts.map((court, position) => ({
          courtId: court.id,
          position,
        })),
      },
    },
    select: { id: true },
  });
  await audit(workspace, "BUNALQ_QUICK_CREATED", session.id, { publicId });
  refresh(publicId);
  redirect(`/dashboard/bunalq/${publicId}`);
}

export async function changeQueueAdmissionModeAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const admissionMode = String(formData.get("admissionMode") ?? "") as OpenPlayAdmissionMode;
  if (!["APPROVAL_REQUIRED", "INSTANT"].includes(admissionMode)) {
    return { message: "Choose a valid guest admission mode." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const updated = await prisma.openPlayQueue.updateMany({
    where: {
      publicId: owned.queue.publicId,
      kind: "QUICK",
      hub: { ownerId: workspace.partnerId },
    },
    data: { admissionMode },
  });
  if (updated.count !== 1) {
    return { message: "Guest self-join is available only for Quick Queues." };
  }
  await audit(workspace, "BUNALQ_ADMISSION_CHANGED", sessionId, { admissionMode });
  refresh(owned.queue.publicId);
  return { success: "Guest admission updated." };
}

export async function joinPublicQueueAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const parsed = publicJoinSchema.safeParse({
    publicId: String(formData.get("publicId") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? DEFAULT_SKILL_LEVEL),
  });
  if (!parsed.success) return { message: "Enter your name and skill level." };
  const context = await getSecurityRequestContext();
  if (!(await consumeRateLimit({
    namespace: "bunalq-public-join",
    subject: `${parsed.data.publicId}:${context.ipHash}`,
    limit: 8,
    windowSeconds: 10 * 60,
    blockSeconds: 15 * 60,
  }))) {
    return { message: "Too many join attempts. Ask the organizer for help." };
  }
  const result = await prisma.$transaction(async (tx) => {
    const queue = await tx.openPlayQueue.findUnique({
      where: { publicId: parsed.data.publicId },
      select: {
        id: true,
        kind: true,
        admissionMode: true,
        hub: { select: { ownerId: true } },
        sessions: {
          orderBy: { runNumber: "desc" },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });
    const current = queue?.sessions[0];
    if (!queue || queue.kind !== "QUICK" || !current || current.status !== "ACTIVE") {
      return { kind: "closed" as const };
    }
    await lockSession(tx, current.id);
    const rosterCount = await tx.openPlayParticipant.count({
      where: { sessionId: current.id, status: { not: "REMOVED" } },
    });
    if (rosterCount >= 100) return { kind: "full" as const };
    let queuePosition: number | null = null;
    if (queue.admissionMode === "INSTANT") {
      const session = await tx.openPlaySession.update({
        where: { id: current.id },
        data: { nextQueuePosition: { increment: 1 } },
        select: { nextQueuePosition: true },
      });
      queuePosition = session.nextQueuePosition;
    }
    const participant = await tx.openPlayParticipant.create({
      data: {
        sessionId: current.id,
        source: "PUBLIC_GUEST",
        displayName: parsed.data.displayName,
        skillLevel: parsed.data.skillLevel,
        status: queue.admissionMode === "INSTANT" ? "QUEUED" : "PENDING_APPROVAL",
        queuePosition,
        checkedInAt: queuePosition ? new Date() : null,
        queuedAt: queuePosition ? new Date() : null,
      },
      select: { id: true },
    });
    await tx.partnerStaffActivity.create({
      data: {
        partnerId: queue.hub.ownerId,
        actorId: null,
        action: "BUNALQ_PUBLIC_GUEST_SUBMITTED",
        targetType: "OpenPlayParticipant",
        targetId: participant.id,
        metadata: { admissionMode: queue.admissionMode },
      },
    });
    return { kind: "joined" as const, admissionMode: queue.admissionMode };
  });
  if (result.kind === "closed") return { message: "This Quick Queue is not accepting players." };
  if (result.kind === "full") return { message: "This Quick Queue has reached its roster limit." };
  refresh(parsed.data.publicId);
  return result.admissionMode === "INSTANT"
    ? { success: "You are in the queue." }
    : { success: "Request sent. The organizer will approve your check-in." };
}

async function moderatePendingGuest(
  formData: FormData,
  operation: "APPROVE" | "REJECT"
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || !participantId) return { message: "Guest request not found." };
  const changed = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return false;
    const participant = await tx.openPlayParticipant.findFirst({
      where: {
        id: participantId,
        sessionId,
        source: "PUBLIC_GUEST",
        status: "PENDING_APPROVAL",
      },
      select: { id: true },
    });
    if (!participant) return false;
    if (operation === "REJECT") {
      await tx.openPlayParticipant.update({
        where: { id: participant.id },
        data: { status: "REMOVED" },
      });
      return true;
    }
    const next = await tx.openPlaySession.update({
      where: { id: sessionId },
      data: { nextQueuePosition: { increment: 1 } },
      select: { nextQueuePosition: true },
    });
    await tx.openPlayParticipant.update({
      where: { id: participant.id },
      data: {
        status: "QUEUED",
        queuePosition: next.nextQueuePosition,
        checkedInAt: new Date(),
        queuedAt: new Date(),
      },
    });
    return true;
  });
  if (!changed) return { message: "That request is no longer pending." };
  await audit(workspace, `BUNALQ_GUEST_${operation}`, sessionId, { participantId });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: operation === "APPROVE" ? "Guest approved and checked in." : "Guest request rejected." };
}

export async function approvePublicQueueGuestAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return moderatePendingGuest(formData, "APPROVE"); }

export async function rejectPublicQueueGuestAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return moderatePendingGuest(formData, "REJECT"); }

export async function editOpenPlayParticipantAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const parsed = participantEditSchema.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    participantId: String(formData.get("participantId") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? ""),
  });
  if (!parsed.success) return { message: "Enter a valid name and skill level." };
  const owned = await ownedSession(parsed.data.sessionId, workspace);
  if (!owned) return { message: "Player not found." };
  const changed = await prisma.openPlayParticipant.updateMany({
    where: {
      id: parsed.data.participantId,
      sessionId: parsed.data.sessionId,
      status: { not: "REMOVED" },
    },
    data: {
      displayName: parsed.data.displayName,
      skillLevel: parsed.data.skillLevel,
    },
  });
  if (changed.count !== 1) return { message: "Player not found." };
  await audit(workspace, "BUNALQ_PLAYER_EDITED", parsed.data.sessionId, {
    participantId: parsed.data.participantId,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Player details updated for this run." };
}

export async function removeOpenPlayParticipantAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || !participantId) return { message: "Player not found." };
  const changed = await prisma.openPlayParticipant.updateMany({
    where: {
      id: participantId,
      sessionId,
      status: { notIn: ["STAGED", "PLAYING", "REMOVED"] },
    },
    data: {
      status: "REMOVED",
      queuePosition: null,
      queuedAt: null,
      pairId: null,
    },
  });
  if (changed.count !== 1) {
    return { message: "Finish or edit the player's current match before removing them." };
  }
  await audit(workspace, "BUNALQ_PLAYER_REMOVED", sessionId, { participantId });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Player removed from the active roster." };
}

export async function bulkCheckInOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantIds = [...new Set(formData.getAll("participantId").map(String))].slice(0, 100);
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || participantIds.length === 0) return { message: "Select players to check in." };
  const count = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return 0;
    const participants = await tx.openPlayParticipant.findMany({
      where: {
        sessionId,
        id: { in: participantIds },
        status: { in: ["NOT_CHECKED_IN", "CHECKED_OUT"] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    let position = session.nextQueuePosition;
    const now = new Date();
    for (const participant of participants) {
      position += 1;
      await tx.openPlayParticipant.update({
        where: { id: participant.id },
        data: {
          status: "QUEUED",
          queuePosition: position,
          checkedInAt: now,
          queuedAt: now,
        },
      });
    }
    if (participants.length > 0) {
      await tx.openPlaySession.update({
        where: { id: sessionId },
        data: { nextQueuePosition: position },
      });
    }
    return participants.length;
  });
  if (count === 0) return { message: "No selected players were eligible for check-in." };
  await audit(workspace, "BUNALQ_BULK_CHECK_IN", sessionId, { count });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `${count} player${count === 1 ? "" : "s"} checked in.` };
}

export async function bulkPauseOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantIds = [
    ...new Set(formData.getAll("participantId").map(String)),
  ].slice(0, 100);
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || participantIds.length === 0) {
    return { message: "Select waiting players to move to break." };
  }
  const count = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return 0;
    const changed = await tx.openPlayParticipant.updateMany({
      where: {
        sessionId,
        id: { in: participantIds },
        status: "QUEUED",
      },
      data: {
        status: "PAUSED",
        queuePosition: null,
        queuedAt: null,
      },
    });
    return changed.count;
  });
  if (count === 0) {
    return { message: "No selected players were eligible for break." };
  }
  await audit(workspace, "BUNALQ_BULK_PAUSE", sessionId, { count });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return {
    success: `${count} player${count === 1 ? "" : "s"} moved to break.`,
  };
}

export async function bulkRemoveOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantIds = [
    ...new Set(formData.getAll("participantId").map(String)),
  ].slice(0, 100);
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || participantIds.length === 0) {
    return { message: "Select players to remove." };
  }
  const count = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return 0;
    const changed = await tx.openPlayParticipant.updateMany({
      where: {
        sessionId,
        id: { in: participantIds },
        status: {
          in: ["NOT_CHECKED_IN", "CHECKED_OUT", "QUEUED", "PAUSED"],
        },
      },
      data: {
        status: "REMOVED",
        queuePosition: null,
        queuedAt: null,
        pairId: null,
      },
    });
    return changed.count;
  });
  if (count === 0) {
    return { message: "No selected players could be removed right now." };
  }
  await audit(workspace, "BUNALQ_BULK_REMOVE", sessionId, { count });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `${count} player${count === 1 ? "" : "s"} removed.` };
}

export async function startNewOpenPlayRunAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const created = await prisma.$transaction(async (tx) => {
    const previous = await lockSession(tx, sessionId);
    if (!previous || previous.status !== "ENDED") return null;
    const latest = await tx.openPlaySession.findFirst({
      where: { queueId: previous.queueId },
      orderBy: { runNumber: "desc" },
      select: { id: true, runNumber: true },
    });
    if (!latest || latest.id !== previous.id) return null;
    const [courts, participants] = await Promise.all([
      tx.openPlaySessionCourt.findMany({
        where: { sessionId },
        orderBy: { position: "asc" },
      }),
      tx.openPlayParticipant.findMany({
        where: { sessionId, status: { not: "REMOVED" } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const quick = previous.queue.kind === "QUICK";
    const next = await tx.openPlaySession.create({
      data: {
        queueId: previous.queueId,
        runNumber: previous.runNumber + 1,
        status: quick ? "ACTIVE" : "SETUP",
        matchingMode: previous.matchingMode,
        createdById: workspace.actorId,
        startedAt: quick ? new Date() : null,
        courts: {
          create: courts.map((court) => ({
            courtId: court.courtId,
            position: court.position,
            active: true,
          })),
        },
      },
      select: { id: true, runNumber: true },
    });
    if (participants.length > 0) {
      await tx.openPlayParticipant.createMany({
        data: participants.map((participant) => ({
          sessionId: next.id,
          source: participant.source,
          userId: participant.userId,
          eventRegistrationId: participant.eventRegistrationId,
          eventGuestSlotId: participant.eventGuestSlotId,
          organizerGuestId: participant.organizerGuestId,
          displayName: participant.displayName,
          skillLevel: participant.skillLevel,
          status: "NOT_CHECKED_IN" as const,
        })),
        skipDuplicates: true,
      });
    }
    if (previous.queue.event) {
      await syncRosterRows(tx, next.id, previous.queue.event.id);
    }
    return next;
  });
  if (!created) return { message: "Only the latest ended run can start a new run." };
  await audit(workspace, "BUNALQ_RUN_CREATED", created.id, {
    previousSessionId: sessionId,
    runNumber: created.runNumber,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `Run ${created.runNumber} is ready.` };
}
