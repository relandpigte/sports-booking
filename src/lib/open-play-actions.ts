"use server";

import crypto from "node:crypto";
import {
  type OpenPlayMatchingMode,
  type OpenPlayParticipantStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DEFAULT_SKILL_LEVEL, SKILL_LEVELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  createGuestBunalQCredential,
  GUEST_BUNALQ_SESSION_MS,
  getGuestBunalQWorkspace,
  isGuestBunalQWorkspace,
  refreshGuestBunalQWorkspace,
  setGuestBunalQOrganizerCookie,
  type OpenPlayWorkspace,
} from "@/lib/guest-bunalq";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSecurityRequestContext } from "@/lib/security-context";
import { manilaToday } from "@/lib/time";
import {
  buildTeammateHistory,
  cancelOpenPlayUpNextGame,
  canTransitionParticipant,
  chooseOpenSlotReplacement,
  getOpenPlayWorkspace,
  listAddableOpenPlayCourts,
  rebuildOpenPlayUpNextGames,
  returnOpenPlayParticipantToQueue,
  syncAutomaticOpenPlayUpNext,
} from "@/lib/open-play";
import {
  OPEN_PLAY_MAX_COURTS,
  OPEN_PLAY_MAX_UP_NEXT_SLOTS,
  OPEN_PLAY_MODES,
  type OpenPlayActionState,
} from "@/lib/open-play-shared";
import { recordPartnerActivity } from "@/lib/staffing";
import { courtDisplayOrder } from "@/lib/court-order";

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
  courtIds: z.array(idSchema).min(1).max(OPEN_PLAY_MAX_COURTS),
});
const guestQuickQueueSchema = z.object({
  title: z.string().trim().min(2).max(120),
  courtCount: z.coerce.number().int().min(1).max(OPEN_PLAY_MAX_COURTS),
  matchingMode: z.enum(OPEN_PLAY_MODES as [OpenPlayMatchingMode, ...OpenPlayMatchingMode[]]),
});
const participantEditSchema = z.object({
  sessionId: idSchema,
  participantId: idSchema,
  displayName: z.string().trim().min(1).max(120),
  skillLevel: z.enum(skillValues),
});
const fillSlotSchema = z.discriminatedUnion("pick", [
  z.object({
    pick: z.literal("auto"),
    sessionId: idSchema,
    gameId: idSchema,
    slot: z.coerce.number().int().min(1).max(4),
    replaceParticipantId: idSchema.optional(),
  }),
  z.object({
    pick: z.literal("manual"),
    sessionId: idSchema,
    gameId: idSchema,
    slot: z.coerce.number().int().min(1).max(4),
    participantId: idSchema,
    replaceParticipantId: idSchema.optional(),
  }),
]);

type Tx = Prisma.TransactionClient;

const BUNALQ_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const;

const PAIRABLE_PARTICIPANT_STATUSES = new Set<OpenPlayParticipantStatus>([
  "NOT_CHECKED_IN",
  "QUEUED",
  "STAGED",
  "PLAYING",
  "PAUSED",
  "CHECKED_OUT",
]);
const SCHEDULED_PARTICIPANT_STATUSES = new Set<OpenPlayParticipantStatus>([
  "STAGED",
  "PLAYING",
]);

function bunalQTransaction<T>(
  operation: (tx: Tx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(operation, BUNALQ_TRANSACTION_OPTIONS);
}

function refresh(queuePublicId: string, eventPublicId?: string | null) {
  revalidatePath(`/dashboard/bunalq/${queuePublicId}`);
  revalidatePath(`/bunalq/manage/${queuePublicId}`);
  revalidatePath(`/q/${queuePublicId}`);
  revalidatePath("/dashboard/bunalq");
  revalidatePath("/bunalq");
  if (eventPublicId) {
    revalidatePath(`/dashboard/events/${eventPublicId}`);
    revalidatePath(`/dashboard/events/${eventPublicId}/bunalq`);
    revalidatePath(`/dashboard/events/${eventPublicId}/open-play`);
    revalidatePath(`/events/${eventPublicId}/live`);
  }
}

async function workspaceForManage(
  sessionId?: string
): Promise<OpenPlayWorkspace | null> {
  const [partnerWorkspace, guestWorkspace] = await Promise.all([
    getOpenPlayWorkspace("MANAGE"),
    getGuestBunalQWorkspace(),
  ]);
  if (!sessionId) return partnerWorkspace;
  const owner = await prisma.openPlaySession.findUnique({
    where: { id: sessionId },
    select: { queue: { select: { hub: { select: { ownerId: true } } } } },
  });
  if (!owner) return null;
  if (partnerWorkspace?.partnerId === owner.queue.hub.ownerId) {
    return partnerWorkspace;
  }
  if (guestWorkspace?.partnerId === owner.queue.hub.ownerId) {
    await refreshGuestBunalQWorkspace(guestWorkspace);
    return guestWorkspace;
  }
  return null;
}

async function ownedSession(
  sessionId: string,
  workspace: OpenPlayWorkspace
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
          hub: { select: { id: true, ownerId: true, guestBunalQOnly: true } },
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

// A new run keeps one Up next match ready per court.
function upNextSlotsFor(courtCount: number): number {
  return Math.min(OPEN_PLAY_MAX_UP_NEXT_SLOTS, Math.max(1, courtCount));
}

async function bumpLiveRevision(tx: Tx, sessionId: string) {
  await tx.openPlaySession.update({
    where: { id: sessionId },
    data: { liveRevision: { increment: 1 } },
  });
}

async function lockCourtAssignments(tx: Tx, courtIds: string[]) {
  for (const courtId of [...new Set(courtIds)].sort()) {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${courtId}))::text AS "locked"
      `
    );
  }
}

async function findActiveCourtConflict(
  tx: Tx,
  courtIds: string[],
  excludedSessionId?: string
) {
  if (courtIds.length === 0) return null;
  return tx.openPlaySessionCourt.findFirst({
    where: {
      courtId: { in: courtIds },
      active: true,
      session: {
        status: "ACTIVE",
        ...(excludedSessionId ? { id: { not: excludedSessionId } } : {}),
      },
    },
    select: { court: { select: { name: true } } },
  });
}

async function dissolvePairs(tx: Tx, sessionId: string, pairIds: string[]) {
  const ids = [...new Set(pairIds.filter(Boolean))];
  if (ids.length === 0) return;
  await tx.openPlayParticipant.updateMany({
    where: { sessionId, pairId: { in: ids } },
    data: { pairId: null },
  });
  await tx.openPlayPair.deleteMany({
    where: { sessionId, id: { in: ids } },
  });
}

async function audit(
  workspace: OpenPlayWorkspace,
  action: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue
) {
  try {
    if (isGuestBunalQWorkspace(workspace)) {
      await prisma.partnerStaffActivity.create({
        data: {
          partnerId: workspace.partnerId,
          actorId: workspace.actorId,
          action,
          targetType: "OpenPlaySession",
          targetId,
          metadata,
        },
      });
    } else {
      await recordPartnerActivity({
        workspace,
        action,
        targetType: "OpenPlaySession",
        targetId,
        metadata,
      });
    }
  } catch (error) {
    // The BunalQ mutation has already committed at every call site. Do not
    // report a false action failure (and invite a duplicate retry) solely
    // because the secondary activity log was temporarily unavailable.
    console.error("Failed to record BunalQ activity", {
      action,
      targetId,
      error,
    });
  }
}

function ratingNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value);
}

function sameRating(
  left: Prisma.Decimal | null,
  right: Prisma.Decimal | null
): boolean {
  if (left == null || right == null) return left == right;
  return left.equals(right);
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
            duprLink: { select: { doubles: true } },
          },
        },
        guestReservation: {
          select: { name: true },
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

  const rosterRows = [
    ...registrations.map((registration) => ({
        sessionId,
        source: "REGISTERED_PLAYER" as const,
        userId: registration.user?.id ?? null,
        eventRegistrationId: registration.id,
        displayName: registration.user
          ? registration.user.privateProfile
            ? "Private player"
            : registration.user.playerName ?? registration.user.name ?? "Player"
          : registration.guestReservation?.name ?? "Guest player",
        skillLevel: registration.user?.skillLevel ?? DEFAULT_SKILL_LEVEL,
        duprRating: registration.user?.duprLink?.doubles ?? null,
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
  ];
  const created = await tx.openPlayParticipant.createMany({
    data: rosterRows,
    skipDuplicates: true,
  });

  const validRegistrationIds = new Set(registrations.map((row) => row.id));
  const validGuestIds = new Set(
    registrations.flatMap((registration) => registration.guests.map((guest) => guest.id))
  );
  const validOrganizerIds = new Set(organizerGuests.map((row) => row.id));
  const sourced = await tx.openPlayParticipant.findMany({
    where: {
      sessionId,
      source: {
        in: ["REGISTERED_PLAYER", "REGISTRATION_GUEST", "ORGANIZER_GUEST"],
      },
    },
    select: {
      id: true,
      source: true,
      eventRegistrationId: true,
      eventGuestSlotId: true,
      organizerGuestId: true,
      status: true,
      pairId: true,
      displayName: true,
      skillLevel: true,
      duprRating: true,
      detailsOverridden: true,
    },
  });
  const registrationDetails = new Map(
    registrations.map((registration) => [
      registration.id,
      {
        displayName: registration.user
          ? registration.user.privateProfile
            ? "Private player"
            : registration.user.playerName ?? registration.user.name ?? "Player"
          : registration.guestReservation?.name ?? "Guest player",
        skillLevel: registration.user?.skillLevel ?? DEFAULT_SKILL_LEVEL,
        duprRating: registration.user?.duprLink?.doubles ?? null,
        privateProfile: registration.user?.privateProfile ?? false,
      },
    ])
  );
  const guestDetails = new Map(
    registrations.flatMap((registration) =>
      registration.guests.map((guest) => [
        guest.id,
        { displayName: guest.name, skillLevel: DEFAULT_SKILL_LEVEL, duprRating: null },
      ] as const)
    )
  );
  const organizerDetails = new Map(
    organizerGuests.map((guest) => [
      guest.id,
      { displayName: guest.name, skillLevel: DEFAULT_SKILL_LEVEL, duprRating: null },
    ])
  );
  let updatedDetails = 0;
  for (const participant of sourced) {
    const details = participant.source === "REGISTERED_PLAYER"
      ? participant.eventRegistrationId
        ? registrationDetails.get(participant.eventRegistrationId)
        : undefined
      : participant.source === "REGISTRATION_GUEST"
        ? participant.eventGuestSlotId
          ? guestDetails.get(participant.eventGuestSlotId)
          : undefined
        : participant.organizerGuestId
          ? organizerDetails.get(participant.organizerGuestId)
          : undefined;
    if (!details) continue;
    const mustMaskPrivate =
      participant.source === "REGISTERED_PLAYER" &&
      "privateProfile" in details &&
      details.privateProfile;
    // An operator's edit is the final word on skill for this run, so it also
    // stops the DUPR rating from re-syncing (the edit clears it).
    const ratingChanged =
      sameRating(participant.duprRating, details.duprRating) === false;
    if (
      (mustMaskPrivate && participant.displayName !== "Private player") ||
      (!participant.detailsOverridden &&
        (participant.displayName !== details.displayName ||
          participant.skillLevel !== details.skillLevel ||
          ratingChanged))
    ) {
      await tx.openPlayParticipant.update({
        where: { id: participant.id },
        data: {
          displayName: mustMaskPrivate ? "Private player" : details.displayName,
          ...(!participant.detailsOverridden
            ? { skillLevel: details.skillLevel, duprRating: details.duprRating }
            : {}),
        },
      });
      updatedDetails += 1;
    }
  }
  const invalid = sourced.filter((participant) => {
    if (participant.status === "REMOVED") return false;
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
  const stagedInvalid = invalid.filter(
    (participant) => participant.status === "STAGED"
  );
  if (stagedInvalid.length > 0) {
    const stagedGames = await tx.openPlayGame.findMany({
      where: {
        sessionId,
        status: "STAGED",
        players: {
          some: {
            participantId: { in: stagedInvalid.map((participant) => participant.id) },
          },
        },
      },
      select: { id: true },
    });
    for (const game of stagedGames) {
      await cancelOpenPlayUpNextGame(tx, sessionId, game.id);
    }
  }
  const removableInvalid = invalid.filter((participant) =>
    ["NOT_CHECKED_IN", "QUEUED", "STAGED", "PAUSED"].includes(
      participant.status
    )
  );
  const invalidPairIds = invalid.flatMap((participant) =>
    participant.pairId ? [participant.pairId] : []
  );
  if (invalidPairIds.length > 0) {
    await dissolvePairs(
      tx,
      sessionId,
      invalidPairIds
    );
  }
  if (removableInvalid.length > 0) {
    await tx.openPlayParticipant.updateMany({
      where: { id: { in: removableInvalid.map((participant) => participant.id) } },
      data: { status: "CHECKED_OUT", queuePosition: null, queuedAt: null },
    });
  }
  return {
    changed:
      created.count > 0 ||
      updatedDetails > 0 ||
      invalidPairIds.length > 0 ||
      removableInvalid.length > 0,
    playingInvalidCount: invalid.filter(
      (participant) => participant.status === "PLAYING"
    ).length,
  };
}

export async function prepareOpenPlayAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
  if (!workspace) return { message: "BunalQ manage access is required." };
  const parsed = publicIdSchema.safeParse(String(formData.get("publicId") ?? ""));
  if (!parsed.success) return { message: "Event not found." };

  const ownedEvent = await prisma.event.findFirst({
    where: { publicId: parsed.data, hub: { ownerId: workspace.partnerId } },
    select: { id: true },
  });
  if (!ownedEvent) return { message: "Event not found." };

  const result = await bunalQTransaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${ownedEvent.id} FOR UPDATE`
    );
    const event = await tx.event.findFirst({
      where: {
        id: ownedEvent.id,
        hub: { ownerId: workspace.partnerId },
      },
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
        courts: {
          include: {
            court: { select: { id: true, sortOrder: true, createdAt: true } },
          },
        },
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
        (left, right) =>
          left.court.sortOrder - right.court.sortOrder ||
          left.court.createdAt.getTime() - right.court.createdAt.getTime()
      );
      const session = await tx.openPlaySession.create({
        data: {
          queueId,
          runNumber: 1,
          createdById: workspace.actorId,
          upNextSlots: upNextSlotsFor(courts.length),
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
    await bumpLiveRevision(tx, sessionId);
    return {
      kind: "ready" as const,
      sessionId,
      queuePublicId: queuePublicId!,
      eventPublicId: event.publicId,
    };
  }).catch((error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2028"
    ) {
      return { kind: "timeout" as const };
    }
    throw error;
  });
  if (result.kind === "missing") return { message: "Event not found." };
  if (result.kind === "unavailable") {
    return { message: "BunalQ requires a published pickleball Event." };
  }
  if (result.kind === "timeout") {
    return {
      message:
        "BunalQ preparation took too long. No changes were saved; please try again.",
    };
  }
  await audit(workspace, "OPEN_PLAY_PREPARED", result.sessionId);
  refresh(result.queuePublicId, result.eventPublicId);
  return { success: "BunalQ is ready." };
}

export async function syncOpenPlayRosterAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const synced = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    if (!session.queue.event) return false;
    const roster = await syncRosterRows(tx, session.id, session.queue.event.id);
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId: session.id,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, session.id);
    return roster;
  });
  if (!synced) return { message: "This Event run has ended." };
  await audit(workspace, "BUNALQ_ROSTER_SYNCED", sessionId, {
    changed: synced.changed,
    playingInvalidCount: synced.playingInvalidCount,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return {
    success: synced.playingInvalidCount > 0
      ? `Roster refreshed. ${synced.playingInvalidCount} cancelled registration remains in a live match; refresh again after that match ends.`
      : synced.changed
        ? "Roster changes applied without reshuffling announced matches."
        : "Roster is already up to date.",
  };
}

export async function addOpenPlayWalkInAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
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
  const participant = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, parsed.data.sessionId);
    if (!session || session.status === "ENDED") return null;
    // Staff add walk-ins standing in front of them, so they join the back
    // of the queue straight away instead of waiting for a check-in.
    const position = session.nextQueuePosition + 1;
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: { nextQueuePosition: position },
    });
    const now = new Date();
    const created = await tx.openPlayParticipant.create({
      data: {
        sessionId: session.id,
        source: "WALK_IN",
        displayName: parsed.data.displayName,
        skillLevel: parsed.data.skillLevel,
        status: "QUEUED",
        queuePosition: position,
        queuedAt: now,
        checkedInAt: now,
      },
      select: { id: true },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId: session.id,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, session.id);
    return created;
  });
  if (!participant) return { message: "This session has ended." };
  await audit(workspace, "OPEN_PLAY_WALK_IN_ADDED", parsed.data.sessionId, {
    participantId: participant.id,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `${parsed.data.displayName} joined the queue.` };
}

type ParticipantOperation =
  | "CHECK_IN"
  | "PAUSE"
  | "RESUME"
  | "CHECK_OUT"
  | "RETURN_TO_QUEUE";

async function participantTransition(
  workspace: OpenPlayWorkspace,
  sessionId: string,
  participantId: string,
  operation: ParticipantOperation
) {
  return bunalQTransaction(async (tx) => {
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
    let openedSlot = false;
    if (operation === "RETURN_TO_QUEUE") {
      const returned = await returnOpenPlayParticipantToQueue(tx, {
        sessionId,
        participantId: participant.id,
      });
      if (!returned) return { message: "That match is no longer available." };
      openedSlot = !returned.cancelled;
    } else if (operation === "PAUSE" && participant.status === "STAGED") {
      // Sitting out leaves an open spot in the announced match instead of
      // rebuilding it; staff fill it by hand or with auto-pick. A match with
      // nobody left in it is cancelled so Up next can prepare a new one.
      const stagedGame = await tx.openPlayGame.findFirst({
        where: {
          sessionId,
          status: "STAGED",
          players: { some: { participantId: participant.id } },
        },
        select: { id: true, _count: { select: { players: true } } },
      });
      if (!stagedGame) {
        return { message: "That upcoming match is no longer available." };
      }
      if (stagedGame._count.players <= 1) {
        await cancelOpenPlayUpNextGame(tx, sessionId, stagedGame.id);
      } else {
        await tx.openPlayGamePlayer.delete({
          where: {
            gameId_participantId: {
              gameId: stagedGame.id,
              participantId: participant.id,
            },
          },
        });
        openedSlot = true;
      }
    }
    if (operation === "RETURN_TO_QUEUE") {
      // Already back in line at their earlier spot.
    } else if (operation === "CHECK_IN" || operation === "RESUME") {
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
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return {
      queuePublicId: session.queue.publicId,
      eventPublicId: session.queue.event?.publicId ?? null,
      openedSlot,
    };
  });
}

async function transitionAction(
  formData: FormData,
  operation: ParticipantOperation
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  if (!sessionId || !participantId) return { message: "Player not found." };
  const result = await participantTransition(workspace, sessionId, participantId, operation);
  if ("message" in result) return result;
  await audit(workspace, `OPEN_PLAY_${operation}`, sessionId, { participantId });
  refresh(result.queuePublicId, result.eventPublicId);
  if (operation === "RETURN_TO_QUEUE") {
    return {
      success: result.openedSlot
        ? "Player returned to the queue. Choose a replacement for the open spot."
        : "Player returned to the queue.",
    };
  }
  return {
    success: result.openedSlot
      ? "Player sat out. Choose a replacement for the open spot."
      : "Player updated.",
  };
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
export async function returnOpenPlayParticipantToQueueAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return transitionAction(formData, "RETURN_TO_QUEUE"); }

export async function startOpenPlaySessionAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.queue.hub.ownerId !== workspace.partnerId) return "missing";
    if (session.status !== "SETUP") return "state";
    if (
      session.queue.kind === "EVENT" &&
      (!session.queue.event ||
        session.queue.event.status !== "PUBLISHED" ||
        session.queue.event.date !== manilaToday())
    ) return "date";
    const activeCourtIds = session.courts
      .filter((court) => court.active)
      .map((court) => court.courtId);
    await lockCourtAssignments(tx, activeCourtIds);
    const conflict = await findActiveCourtConflict(
      tx,
      activeCourtIds,
      session.id
    );
    if (conflict) return "court-conflict";
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: {
        status: "ACTIVE",
        startedAt: new Date(),
        liveRevision: { increment: 1 },
      },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId: session.id,
      createdById: workspace.actorId,
    });
    return "started";
  });
  if (result === "date") return { message: "The session can start only on the published Event date." };
  if (result === "court-conflict") {
    return { message: "One of these courts is already assigned to another active BunalQ." };
  }
  if (result !== "started") return { message: "The session cannot be started." };
  await audit(workspace, "OPEN_PLAY_STARTED", sessionId);
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "BunalQ run started." };
}

export async function changeOpenPlayModeAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const mode = String(formData.get("mode") ?? "") as OpenPlayMatchingMode;
  if (!OPEN_PLAY_MODES.includes(mode)) return { message: "Choose a valid matching mode." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const changed = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: { matchingMode: mode, liveRevision: { increment: 1 } },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId: session.id,
      createdById: workspace.actorId,
      refreshAutomatic: true,
    });
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const firstId = String(formData.get("firstId") ?? "");
  const secondId = String(formData.get("secondId") ?? "");
  if (!sessionId || !firstId || !secondId || firstId === secondId) {
    return { message: "Choose two different players." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    const participants = await tx.openPlayParticipant.findMany({
      where: { id: { in: [firstId, secondId] }, sessionId },
      select: { id: true, status: true, pairId: true },
    });
    if (
      participants.length !== 2 ||
      participants.some(
        (participant) => !PAIRABLE_PARTICIPANT_STATUSES.has(participant.status)
      )
    ) return false;
    const oldPairIds = participants.flatMap((participant) => participant.pairId ? [participant.pairId] : []);
    const oldPairMembers = oldPairIds.length > 0
      ? await tx.openPlayParticipant.findMany({
          where: { sessionId, pairId: { in: oldPairIds } },
          select: { status: true },
        })
      : [];
    const preserveScheduledGames = [...participants, ...oldPairMembers].some(
      (participant) => SCHEDULED_PARTICIPANT_STATUSES.has(participant.status)
    );
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
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
      refreshAutomatic: !preserveScheduledGames,
    });
    await bumpLiveRevision(tx, sessionId);
    return preserveScheduledGames ? "deferred" : "applied";
  });
  if (!result) return { message: "Those players cannot be paired right now." };
  await audit(workspace, "OPEN_PLAY_PAIR_CREATED", sessionId, { firstId, secondId });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return {
    success:
      result === "deferred"
        ? "Fixed partners saved. Playing and Up Next matches were kept unchanged; the pair applies when both players return to the queue."
        : "Fixed partners saved.",
  };
}

export async function unpairOpenPlayParticipantsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const pairId = String(formData.get("pairId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const removed = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    const pair = await tx.openPlayPair.findFirst({
      where: { id: pairId, sessionId },
      select: {
        id: true,
        participants: { select: { status: true } },
      },
    });
    if (!pair) return false;
    const preserveScheduledGames = pair.participants.some((participant) =>
      SCHEDULED_PARTICIPANT_STATUSES.has(participant.status)
    );
    await tx.openPlayParticipant.updateMany({ where: { sessionId, pairId }, data: { pairId: null } });
    await tx.openPlayPair.delete({ where: { id: pairId } });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
      refreshAutomatic: !preserveScheduledGames,
    });
    await bumpLiveRevision(tx, sessionId);
    return preserveScheduledGames ? "deferred" : "applied";
  });
  if (!removed) return { message: "That pair cannot be removed." };
  await audit(workspace, "OPEN_PLAY_PAIR_REMOVED", sessionId, { pairId });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return {
    success:
      removed === "deferred"
        ? "Pair removed. Playing and Up Next matches were kept unchanged; the change applies when those players return to the queue."
        : "Pair removed.",
  };
}

export async function toggleOpenPlayCourtAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return "ended";
    const court = session.courts.find((item) => item.courtId === courtId);
    if (!court) return "missing";
    if (active) {
      await lockCourtAssignments(tx, [courtId]);
      const conflict = await findActiveCourtConflict(tx, [courtId], sessionId);
      if (conflict) return "conflict";
    }
    if (!active) {
      const occupied = await tx.openPlayGame.count({
        where: { sessionId, courtId, status: "ACTIVE" },
      });
      if (occupied > 0) return "occupied";
      await tx.openPlayGame.updateMany({
        where: { sessionId, courtId, status: "STAGED" },
        data: { courtId: null },
      });
    }
    await tx.openPlaySessionCourt.update({
      where: { sessionId_courtId: { sessionId, courtId } },
      data: { active },
    });
    await tx.openPlaySession.update({
      where: { id: sessionId },
      data: { liveRevision: { increment: 1 } },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    return "updated";
  });
  if (result === "occupied") return { message: "Finish or clear this court's match before pausing it." };
  if (result === "conflict") {
    return { message: "That court is already assigned to another active BunalQ." };
  }
  if (result !== "updated") return { message: "Court cannot be updated." };
  await audit(workspace, "OPEN_PLAY_COURT_UPDATED", sessionId, {
    courtId,
    active,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: active ? "Court resumed." : "Court paused." };
}

export async function addOpenPlayCourtAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const requestedCourtId = String(formData.get("courtId") ?? "");
  const workspace = await workspaceForManage(sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return { kind: "ended" as const };
    if (session.courts.length >= OPEN_PLAY_MAX_COURTS) {
      return { kind: "full" as const };
    }
    const inRun = new Set(session.courts.map((court) => court.courtId));
    let court: { id: string; name: string };
    if (session.queue.hub.guestBunalQOnly) {
      // Guest rooms own their numbered courts: bring back one removed earlier
      // before creating the next "Court N".
      const hubCourts = await tx.court.findMany({
        where: { hubId: session.queue.hub.id },
        orderBy: courtDisplayOrder,
        select: { id: true, name: true, sortOrder: true },
      });
      court =
        hubCourts.find((item) => !inRun.has(item.id)) ??
        (await tx.court.create({
          data: {
            hubId: session.queue.hub.id,
            name: `Court ${hubCourts.length + 1}`,
            sport: "pickleball",
            sortOrder:
              Math.max(-1, ...hubCourts.map((item) => item.sortOrder)) + 1,
          },
          select: { id: true, name: true },
        }));
    } else {
      const options = await listAddableOpenPlayCourts(tx, {
        id: session.id,
        hubId: session.queue.hub.id,
        eventId: session.queue.event?.id ?? null,
        courtIds: [...inRun],
      });
      const option = options.find((item) => item.id === requestedCourtId);
      if (!option) return { kind: "unavailable" as const };
      court = option;
    }
    await lockCourtAssignments(tx, [court.id]);
    const conflict = await findActiveCourtConflict(tx, [court.id], session.id);
    if (conflict) {
      return { kind: "conflict" as const, courtName: conflict.court.name };
    }
    await tx.openPlaySessionCourt.create({
      data: {
        sessionId,
        courtId: court.id,
        position:
          Math.max(-1, ...session.courts.map((item) => item.position)) + 1,
      },
    });
    // Each court brings its own Up next box.
    await tx.openPlaySession.update({
      where: { id: sessionId },
      data: {
        upNextSlots: Math.min(OPEN_PLAY_MAX_UP_NEXT_SLOTS, session.upNextSlots + 1),
      },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return { kind: "added" as const, courtId: court.id, courtName: court.name };
  });
  if (result.kind === "full") {
    return { message: `A run can use up to ${OPEN_PLAY_MAX_COURTS} courts.` };
  }
  if (result.kind === "conflict") {
    return { message: `${result.courtName} is already assigned to another active BunalQ.` };
  }
  if (result.kind === "unavailable") {
    return { message: "That court can't be added to this run." };
  }
  if (result.kind !== "added") return { message: "This BunalQ run has ended." };
  await audit(workspace, "OPEN_PLAY_COURT_ADDED", sessionId, {
    courtId: result.courtId,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `${result.courtName} added.` };
}

export async function removeOpenPlayCourtAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const workspace = await workspaceForManage(sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return "ended" as const;
    if (!session.courts.some((court) => court.courtId === courtId)) {
      return "missing" as const;
    }
    if (session.courts.length <= 1) return "last" as const;
    const live = await tx.openPlayGame.count({
      where: { sessionId, courtId, status: "ACTIVE" },
    });
    if (live > 0) return "occupied" as const;
    // A match waiting on this court goes back to the front of Up next.
    await tx.openPlayGame.updateMany({
      where: { sessionId, courtId, status: "STAGED" },
      data: { courtId: null },
    });
    await tx.openPlaySessionCourt.delete({
      where: { sessionId_courtId: { sessionId, courtId } },
    });
    await tx.openPlaySession.update({
      where: { id: sessionId },
      data: { upNextSlots: Math.max(1, session.upNextSlots - 1) },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return "removed" as const;
  });
  if (result === "last") return { message: "Keep at least one court in the run." };
  if (result === "occupied") {
    return { message: "Finish or clear this court's match before removing it." };
  }
  if (result !== "removed") return { message: "That court is no longer in this run." };
  await audit(workspace, "OPEN_PLAY_COURT_REMOVED", sessionId, { courtId });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Court removed." };
}

export async function addOpenPlayUpNextSlotAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const workspace = await workspaceForManage(sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return "ended" as const;
    if (session.upNextSlots >= OPEN_PLAY_MAX_UP_NEXT_SLOTS) return "full" as const;
    await tx.openPlaySession.update({
      where: { id: sessionId },
      data: { upNextSlots: session.upNextSlots + 1 },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return "added" as const;
  });
  if (result === "full") {
    return { message: `Up next holds at most ${OPEN_PLAY_MAX_UP_NEXT_SLOTS} matches.` };
  }
  if (result !== "added") return { message: "This BunalQ run has ended." };
  await audit(workspace, "OPEN_PLAY_UP_NEXT_SLOT_ADDED", sessionId);
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Up next match added." };
}

export async function removeOpenPlayUpNextSlotAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const expectedSlots = Number(formData.get("expectedSlots"));
  const workspace = await workspaceForManage(sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return "ended" as const;
    if (session.upNextSlots <= 1) return "last" as const;
    if (gameId) {
      // Removing a box drops its match, even a hand-picked one; its players
      // go back to their spots in line.
      const game = await tx.openPlayGame.findFirst({
        where: { id: gameId, sessionId, status: "STAGED", courtId: null },
        select: { id: true },
      });
      if (!game) return "moved" as const;
      await cancelOpenPlayUpNextGame(tx, sessionId, game.id);
    } else if (expectedSlots !== session.upNextSlots) {
      // An empty box carries the count it was drawn with, so a double click
      // or a second organizer can't remove two boxes for one.
      return "stale" as const;
    }
    await tx.openPlaySession.update({
      where: { id: sessionId },
      data: { upNextSlots: session.upNextSlots - 1 },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return "removed" as const;
  });
  if (result === "last") return { message: "Keep at least one Up next match." };
  if (result === "moved") {
    return { message: "That match already moved. Refresh to see the latest Up next." };
  }
  if (result === "stale") {
    return { message: "Up next just changed. Refresh to see the latest Up next.", reloadRequired: true };
  }
  if (result !== "removed") return { message: "This BunalQ run has ended." };
  await audit(workspace, "OPEN_PLAY_UP_NEXT_SLOT_REMOVED", sessionId, {
    gameId: gameId || null,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Up next match removed." };
}

async function rebuildUpNext(
  formData: FormData,
  scope: "one" | "automatic"
): Promise<OpenPlayActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const workspace = await workspaceForManage(sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  if (scope === "one" && !gameId) return { message: "Choose a match to rebuild." };
  const outcome = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const games = await tx.openPlayGame.findMany({
      where:
        scope === "one"
          ? { id: gameId, sessionId, status: "STAGED" }
          : {
              sessionId,
              status: "STAGED",
              courtId: null,
              selectionMethod: "AUTOMATIC",
            },
      select: { id: true },
    });
    if (games.length === 0) return "none" as const;
    const rebuilt = await rebuildOpenPlayUpNextGames(tx, {
      sessionId,
      gameIds: games.map((game) => game.id),
      createdById: workspace.actorId,
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return rebuilt;
  });
  if (!outcome) return { message: "Start the run before rebuilding Up next." };
  if (outcome === "none") {
    return scope === "one"
      ? { message: "That match already moved. Refresh to see the latest Up next." }
      : { message: "There are no automatic Up next matches to refresh." };
  }
  await audit(
    workspace,
    scope === "one" ? "OPEN_PLAY_UP_NEXT_REBUILT" : "OPEN_PLAY_UP_NEXT_REFRESHED",
    sessionId,
    { gameId: gameId || null, ...outcome }
  );
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  if (outcome.rebuilt === 0 && outcome.cleared === 0) {
    return { message: "No other matchup is available right now." };
  }
  if (scope === "one") {
    return {
      success:
        outcome.cleared > 0
          ? "Not enough players are waiting, so the match was cleared."
          : "Match rebuilt.",
    };
  }
  return { success: "Up next refreshed." };
}

export async function rebuildOpenPlayUpNextMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return rebuildUpNext(formData, "one"); }
export async function refreshOpenPlayUpNextAction(
  _previous: OpenPlayActionState,
  formData: FormData
) { return rebuildUpNext(formData, "automatic"); }

async function startStagedOpenPlayGame(
  tx: Tx,
  input: {
    sessionId: string;
    gameId: string;
  }
): Promise<string | null> {
  const game = await tx.openPlayGame.findFirst({
    where: {
      sessionId: input.sessionId,
      id: input.gameId,
      status: "STAGED",
      courtId: { not: null },
    },
    include: {
      players: {
        include: { participant: { select: { status: true } } },
      },
    },
  });
  if (
    !game ||
    !game.courtId ||
    game.players.length !== 4 ||
    game.players.some((player) => player.participant.status !== "STAGED")
  ) return null;

  await tx.openPlayGame.update({
    where: { id: game.id },
    data: {
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
  await tx.openPlayParticipant.updateMany({
    where: {
      id: { in: game.players.map((player) => player.participantId) },
      sessionId: input.sessionId,
      status: "STAGED",
    },
    data: { status: "PLAYING" },
  });
  return game.id;
}

export async function dispatchOpenPlayUpNextAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return { kind: "inactive" as const };
    const court = session.courts.find((item) => item.courtId === courtId && item.active);
    if (!court) return { kind: "court" as const };
    const occupied = await tx.openPlayGame.count({
      where: {
        sessionId,
        courtId,
        status: { in: ["STAGED", "ACTIVE"] },
      },
    });
    if (occupied > 0) return { kind: "occupied" as const };
    const gameId = String(formData.get("gameId") ?? "");
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "STAGED", courtId: null },
      select: { id: true },
    });
    if (!game) return { kind: "game" as const };
    await tx.openPlayGame.update({
      where: { id: game.id },
      data: { courtId },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return { kind: "dispatched" as const, gameId };
  });
  if (result.kind === "occupied") {
    return { message: "That court already has a match ready or playing." };
  }
  if (result.kind === "court") {
    return { message: "Choose an active court." };
  }
  if (result.kind !== "dispatched") {
    return { message: "That upcoming match is no longer available." };
  }
  await audit(workspace, "OPEN_PLAY_MATCH_DISPATCHED", sessionId, {
    gameId: result.gameId,
    courtId,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Match sent to court." };
}

export async function replaceStagedCourtMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const courtGameId = String(formData.get("courtGameId") ?? "");
  const replacementGameId = String(formData.get("replacementGameId") ?? "");
  if (!sessionId || !courtGameId || !replacementGameId || courtGameId === replacementGameId) {
    return { message: "Choose a valid Up next replacement." };
  }
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const replaced = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const games = await tx.openPlayGame.findMany({
      where: {
        sessionId,
        id: { in: [courtGameId, replacementGameId] },
        status: "STAGED",
      },
      select: { id: true, courtId: true },
    });
    const courtGame = games.find(
      (game) => game.id === courtGameId && game.courtId !== null
    );
    const replacement = games.find(
      (game) => game.id === replacementGameId && game.courtId === null
    );
    if (
      !courtGame?.courtId ||
      !replacement ||
      !session.courts.some(
        (court) => court.courtId === courtGame.courtId && court.active
      )
    ) return null;
    const activeOnCourt = await tx.openPlayGame.count({
      where: {
        sessionId,
        courtId: courtGame.courtId,
        status: "ACTIVE",
      },
    });
    if (activeOnCourt > 0) return null;
    await tx.openPlayGame.update({
      where: { id: courtGame.id },
      data: { courtId: null },
    });
    await tx.openPlayGame.update({
      where: { id: replacement.id },
      data: { courtId: courtGame.courtId },
    });
    await bumpLiveRevision(tx, sessionId);
    return { courtId: courtGame.courtId };
  });
  if (!replaced) {
    return { message: "That staged match can no longer be replaced." };
  }
  await audit(workspace, "OPEN_PLAY_MATCH_REPLACED", sessionId, {
    courtGameId,
    replacementGameId,
    courtId: replaced.courtId,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Court matchup replaced; the previous match moved to Up next." };
}

export async function startOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const started = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const staged = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "STAGED" },
      select: { courtId: true, _count: { select: { players: true } } },
    });
    if (staged && staged._count.players < 4) return "incomplete" as const;
    if (
      !staged?.courtId ||
      !session.courts.some(
        (court) => court.courtId === staged.courtId && court.active
      )
    ) return null;
    const active = await tx.openPlayGame.count({
      where: {
        sessionId,
        courtId: staged.courtId,
        status: "ACTIVE",
      },
    });
    if (active > 0) return null;
    const startedGameId = await startStagedOpenPlayGame(tx, {
      sessionId,
      gameId,
    });
    if (!startedGameId) return null;
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return startedGameId;
  });
  if (started === "incomplete") {
    return { message: "Fill the open spot before starting this match." };
  }
  if (!started) return { message: "This match cannot be started." };
  await audit(workspace, "OPEN_PLAY_MATCH_STARTED", sessionId, {
    gameId: started,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Match started." };
}

export async function editStagedOpenPlayMatchAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
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
  const edited = await bunalQTransaction(async (tx) => {
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
    await bumpLiveRevision(tx, sessionId);
    return true;
  });
  if (!edited) return { message: "The upcoming match could not be edited." };
  await audit(workspace, "OPEN_PLAY_MATCH_EDITED", sessionId, { gameId });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: "Up Next teams updated." };
}

export async function fillOpenPlaySlotAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const parsed = fillSlotSchema.safeParse({
    pick: formData.get("pick"),
    sessionId: formData.get("sessionId"),
    gameId: formData.get("gameId"),
    slot: formData.get("slot"),
    participantId: formData.get("participantId") ?? undefined,
    replaceParticipantId: formData.get("replaceParticipantId") || undefined,
  });
  if (!parsed.success) return { message: "Choose a player for the open spot." };
  const input = parsed.data;
  const workspace = await workspaceForManage(input.sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(input.sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  // Slots 1-2 are always Team 1 and 3-4 Team 2, matching how matches are built.
  const team: 1 | 2 = input.slot <= 2 ? 1 : 2;
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (!session || session.status !== "ACTIVE") return { kind: "inactive" as const };
    // Live matches can be short a player too, once staff return someone to
    // the queue mid-game; the replacement joins the match already underway.
    const game = await tx.openPlayGame.findFirst({
      where: {
        id: input.gameId,
        sessionId: session.id,
        status: { in: ["STAGED", "ACTIVE"] },
      },
      select: {
        id: true,
        status: true,
        players: {
          select: {
            participantId: true,
            team: true,
            slot: true,
            participant: {
              select: { skillLevel: true, duprRating: true, lastResult: true },
            },
          },
        },
      },
    });
    if (!game) return { kind: "game" as const };
    // Replacing someone frees their spot first: they go back to their place
    // in line, then the spot is filled like any other open spot.
    const replacing = input.replaceParticipantId
      ? game.players.find(
          (player) =>
            player.participantId === input.replaceParticipantId &&
            player.slot === input.slot
        )
      : undefined;
    let replacedName: string | null = null;
    if (input.replaceParticipantId) {
      if (!replacing || game.players.length < 2) return { kind: "replaced" as const };
      const returned = await returnOpenPlayParticipantToQueue(tx, {
        sessionId: session.id,
        participantId: replacing.participantId,
      });
      if (!returned || returned.cancelled) return { kind: "replaced" as const };
      game.players = game.players.filter((player) => player !== replacing);
      replacedName = (
        await tx.openPlayParticipant.findUnique({
          where: { id: replacing.participantId },
          select: { displayName: true },
        })
      )?.displayName ?? null;
    }
    if (game.players.some((player) => player.slot === input.slot)) {
      return { kind: "taken" as const };
    }

    let chosen: { id: string; queuePosition: number; displayName: string } | null = null;
    let movedFrom: { gameId: string; cancelled: boolean } | null = null;
    if (input.pick === "manual" && input.participantId !== input.replaceParticipantId) {
      const participant = await tx.openPlayParticipant.findFirst({
        where: {
          id: input.participantId,
          sessionId: session.id,
          status: { in: ["QUEUED", "STAGED"] },
        },
        select: { id: true, status: true, queuePosition: true, displayName: true },
      });
      if (participant?.status === "QUEUED" && participant.queuePosition != null) {
        chosen = { ...participant, queuePosition: participant.queuePosition };
      } else if (participant?.status === "STAGED") {
        // Staff can pull a player out of another match that hasn't started.
        // That match keeps an open spot, and the player keeps their original
        // place in line in case they are returned to the queue later.
        const source = await tx.openPlayGame.findFirst({
          where: {
            sessionId: session.id,
            status: "STAGED",
            id: { not: game.id },
            players: { some: { participantId: participant.id } },
          },
          select: {
            id: true,
            players: { select: { participantId: true, queuePositionBefore: true } },
          },
        });
        const row = source?.players.find(
          (player) => player.participantId === participant.id
        );
        if (source && row) {
          await tx.openPlayGamePlayer.delete({
            where: {
              gameId_participantId: { gameId: source.id, participantId: participant.id },
            },
          });
          const cancelled = source.players.length <= 1;
          if (cancelled) {
            await tx.openPlayGame.updateMany({
              where: { id: source.id, sessionId: session.id, status: "STAGED" },
              data: { status: "CANCELLED", cancelledAt: new Date() },
            });
          }
          movedFrom = { gameId: source.id, cancelled };
          chosen = {
            id: participant.id,
            displayName: participant.displayName,
            queuePosition: row.queuePositionBefore,
          };
        }
      }
    } else {
      const [queuedRows, completedGames] = await Promise.all([
        tx.openPlayParticipant.findMany({
          where: {
            sessionId: session.id,
            status: "QUEUED",
            queuePosition: { not: null },
            ...(input.replaceParticipantId
              ? { id: { not: input.replaceParticipantId } }
              : {}),
          },
          orderBy: { queuePosition: "asc" },
          select: {
            id: true,
            queuePosition: true,
            skillLevel: true,
            duprRating: true,
            lastResult: true,
            pairId: true,
            displayName: true,
          },
        }),
        tx.openPlayGame.findMany({
          where: { sessionId: session.id, status: "COMPLETED" },
          select: {
            sequence: true,
            completedAt: true,
            players: { select: { participantId: true, team: true } },
          },
        }),
      ]);
      const queued = queuedRows.flatMap((row) =>
        row.queuePosition == null
          ? []
          : [
              {
                ...row,
                queuePosition: row.queuePosition,
                duprRating: ratingNumber(row.duprRating),
              },
            ]
      );
      const pick = chooseOpenSlotReplacement({
        mode: session.matchingMode,
        queued,
        team,
        remaining: game.players.map((player) => ({
          id: player.participantId,
          team: player.team,
          skillLevel: player.participant.skillLevel,
          duprRating: ratingNumber(player.participant.duprRating),
          lastResult: player.participant.lastResult,
        })),
        teammateHistory: buildTeammateHistory(completedGames),
        completedGames,
      });
      chosen = pick ? queued.find((row) => row.id === pick.id) ?? null : null;
    }
    if (!chosen) return { kind: "player" as const };

    await tx.openPlayGamePlayer.create({
      data: {
        gameId: game.id,
        participantId: chosen.id,
        team,
        slot: input.slot,
        queuePositionBefore: chosen.queuePosition,
      },
    });
    await tx.openPlayParticipant.update({
      where: { id: chosen.id },
      data: {
        status: game.status === "ACTIVE" ? "PLAYING" : "STAGED",
        queuePosition: null,
        queuedAt: null,
      },
    });
    if (input.pick === "manual" || replacing) {
      await tx.openPlayGame.update({
        where: { id: game.id },
        data: { selectionMethod: "MANUAL" },
      });
    }
    if (movedFrom?.cancelled) {
      await syncAutomaticOpenPlayUpNext(tx, {
        sessionId: session.id,
        createdById: workspace.actorId,
      });
    }
    await bumpLiveRevision(tx, session.id);
    return {
      kind: "filled" as const,
      participantId: chosen.id,
      displayName: chosen.displayName,
      movedFromGameId: movedFrom?.gameId ?? null,
      replacedName,
    };
  });
  if (result.kind === "taken") {
    return { message: "That spot was just filled. Pick another open spot." };
  }
  if (result.kind === "replaced") {
    return { message: "That player is no longer in this match." };
  }
  if (result.kind === "player") {
    return {
      message:
        input.pick === "auto"
          ? "No waiting player is available for this spot."
          : "That player is no longer waiting or in an upcoming match.",
    };
  }
  if (result.kind !== "filled") {
    return { message: "That upcoming match is no longer available." };
  }
  await audit(workspace, "OPEN_PLAY_SLOT_FILLED", input.sessionId, {
    gameId: input.gameId,
    slot: input.slot,
    participantId: result.participantId,
    pick: input.pick,
    movedFromGameId: result.movedFromGameId,
    replacedParticipantId: input.replaceParticipantId ?? null,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return {
    success: result.replacedName
      ? `${result.displayName} replaced ${result.replacedName}.`
      : result.movedFromGameId
        ? `${result.displayName} moved to Team ${team}. Their previous match now has an open spot.`
        : `${result.displayName} joined Team ${team}.`,
  };
}

const switchTeamsSchema = z.object({
  sessionId: idSchema,
  gameId: idSchema,
  participantId: idSchema,
  otherParticipantId: idSchema,
});

export async function switchOpenPlayTeamsAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const parsed = switchTeamsSchema.safeParse({
    sessionId: formData.get("sessionId"),
    gameId: formData.get("gameId"),
    participantId: formData.get("participantId"),
    otherParticipantId: formData.get("otherParticipantId"),
  });
  if (!parsed.success || parsed.data.participantId === parsed.data.otherParticipantId) {
    return { message: "Choose a player on the other team." };
  }
  const input = parsed.data;
  const workspace = await workspaceForManage(input.sessionId);
  if (!workspace) return { message: "BunalQ manage access is required." };
  const owned = await ownedSession(input.sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const result = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const game = await tx.openPlayGame.findFirst({
      where: {
        id: input.gameId,
        sessionId: session.id,
        status: { in: ["STAGED", "ACTIVE"] },
      },
      select: {
        id: true,
        status: true,
        players: {
          select: {
            participantId: true,
            team: true,
            slot: true,
            queuePositionBefore: true,
            participant: { select: { displayName: true } },
          },
        },
      },
    });
    const first = game?.players.find((player) => player.participantId === input.participantId);
    const second = game?.players.find((player) => player.participantId === input.otherParticipantId);
    if (!game || !first || !second || first.team === second.team) return null;
    // Slots are unique per match and limited to 1-4, so one row is lifted
    // out while the other takes its slot, then put back in the freed one.
    await tx.openPlayGamePlayer.delete({
      where: {
        gameId_participantId: { gameId: game.id, participantId: second.participantId },
      },
    });
    await tx.openPlayGamePlayer.update({
      where: {
        gameId_participantId: { gameId: game.id, participantId: first.participantId },
      },
      data: { team: second.team, slot: second.slot },
    });
    await tx.openPlayGamePlayer.create({
      data: {
        gameId: game.id,
        participantId: second.participantId,
        team: first.team,
        slot: first.slot,
        queuePositionBefore: second.queuePositionBefore,
      },
    });
    if (game.status === "STAGED") {
      await tx.openPlayGame.update({
        where: { id: game.id },
        data: { selectionMethod: "MANUAL" },
      });
    }
    await bumpLiveRevision(tx, session.id);
    return {
      first: first.participant.displayName,
      second: second.participant.displayName,
    };
  });
  if (!result) {
    return { message: "Those players are no longer on opposite teams in this match." };
  }
  await audit(workspace, "OPEN_PLAY_TEAMS_SWITCHED", input.sessionId, {
    gameId: input.gameId,
    participantId: input.participantId,
    otherParticipantId: input.otherParticipantId,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `${result.first} and ${result.second} switched teams.` };
}

export async function recordOpenPlayWinnerAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const winningTeam = Number(formData.get("winningTeam"));
  if (winningTeam !== 1 && winningTeam !== 2) return { message: "Choose the winning team." };
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const completed = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "ACTIVE" },
      include: { players: true },
    });
    if (!game || !game.courtId) return null;
    if (game.players.length !== 4) return "incomplete" as const;
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
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: {
        nextQueuePosition: next,
        liveRevision: { increment: 1 },
      },
    });
    await tx.openPlayGame.update({
      where: { id: game.id },
      data: { status: "COMPLETED", winningTeam, completedAt: new Date() },
    });
    const synced = await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    return { nextGameIds: synced.assignedGameIds };
  });
  if (completed === "incomplete") {
    return { message: "Fill the open spot before recording a result." };
  }
  if (!completed) return { message: "This result was already recorded or the match is unavailable." };
  await audit(workspace, "OPEN_PLAY_RESULT_RECORDED", sessionId, {
    gameId,
    winningTeam,
    nextGameIds: completed.nextGameIds,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return {
    success: completed.nextGameIds.length > 0
      ? "Winner recorded; the next match is staged on court."
      : "Winner recorded; the court is ready.",
  };
}

export async function swapOpenPlayWinnerAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const swapped = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "COMPLETED", winningTeam: { in: [1, 2] } },
      include: { players: true },
    });
    if (!game?.winningTeam) return null;
    const winningTeam = game.winningTeam === 1 ? 2 : 1;
    await tx.openPlayGame.update({ where: { id: game.id }, data: { winningTeam } });
    // A player's last result only follows this match while it is still the
    // latest one they finished; later results stay as recorded.
    for (const slot of game.players) {
      const latest = await tx.openPlayGame.findFirst({
        where: {
          sessionId,
          status: "COMPLETED",
          players: { some: { participantId: slot.participantId } },
        },
        orderBy: [{ completedAt: "desc" }, { sequence: "desc" }],
        select: { id: true },
      });
      if (latest?.id !== game.id) continue;
      await tx.openPlayParticipant.update({
        where: { id: slot.participantId },
        data: { lastResult: slot.team === winningTeam ? "WIN" : "LOSS" },
      });
    }
    await bumpLiveRevision(tx, sessionId);
    return { winningTeam };
  });
  if (!swapped) return { message: "This result can no longer be changed." };
  await audit(workspace, "OPEN_PLAY_RESULT_SWAPPED", sessionId, {
    gameId,
    winningTeam: swapped.winningTeam,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `Team ${swapped.winningTeam} is now the winner.` };
}

export async function undoOpenPlayResultAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const undone = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return false;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "COMPLETED" },
      include: { players: { include: { participant: { select: { status: true } } } } },
    });
    if (
      !game ||
      !game.courtId ||
      !game.startedAt ||
      !session.courts.some((court) => court.courtId === game.courtId) ||
      game.players.some(
        (slot) => !["QUEUED", "STAGED"].includes(slot.participant.status)
      )
    ) return false;
    // Any later match that started on this court, including one cancelled
    // after staff returned all its players, makes this result final.
    const newerStarted = await tx.openPlayGame.count({
      where: {
        sessionId,
        courtId: game.courtId,
        startedAt: { gt: game.startedAt },
      },
    });
    if (newerStarted > 0) return false;
    await tx.openPlayGame.updateMany({
      where: {
        sessionId,
        courtId: game.courtId,
        status: "STAGED",
      },
      data: { courtId: null },
    });
    const restoredPlayerIds = game.players.map((slot) => slot.participantId);
    const conflictingUpNext = await tx.openPlayGame.findMany({
      where: {
        sessionId,
        status: "STAGED",
        players: { some: { participantId: { in: restoredPlayerIds } } },
      },
      select: { id: true },
    });
    for (const upcoming of conflictingUpNext) {
      await cancelOpenPlayUpNextGame(tx, sessionId, upcoming.id);
    }
    const restoredPlayers = await tx.openPlayParticipant.findMany({
      where: { id: { in: restoredPlayerIds }, sessionId },
      select: { id: true, status: true },
    });
    if (
      restoredPlayers.length !== 4 ||
      restoredPlayers.some((participant) => participant.status !== "QUEUED")
    ) return false;
    for (const slot of game.players) {
      const previous = await tx.openPlayGame.findFirst({
        where: {
          sessionId,
          status: "COMPLETED",
          ...(game.completedAt
            ? { completedAt: { lt: game.completedAt } }
            : { sequence: { lt: game.sequence } }),
          players: { some: { participantId: slot.participantId } },
        },
        orderBy: game.completedAt
          ? { completedAt: "desc" }
          : { sequence: "desc" },
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
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const ended = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    await tx.openPlayGame.updateMany({
      where: { sessionId, status: { in: ["STAGED", "ACTIVE"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.openPlayParticipant.updateMany({
      where: {
        sessionId,
        status: {
          notIn: ["CHECKED_OUT", "REMOVED", "PENDING_APPROVAL"],
        },
      },
      data: { status: "CHECKED_OUT", queuePosition: null, queuedAt: null },
    });
    await tx.openPlayParticipant.updateMany({
      where: { sessionId, status: "PENDING_APPROVAL" },
      data: { status: "REMOVED", queuePosition: null, queuedAt: null },
    });
    await tx.openPlaySession.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
        liveRevision: { increment: 1 },
      },
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
    courtIds: [...new Set(formData.getAll("courtId").map(String))],
  });
  if (!parsed.success) {
    return { message: "Choose a hub, at least one court, and a queue name." };
  }
  const created = await bunalQTransaction(async (tx) => {
    await lockCourtAssignments(tx, parsed.data.courtIds);
    const hub = await tx.hub.findFirst({
      where: { id: parsed.data.hubId, ownerId: workspace.partnerId },
      select: {
        id: true,
        courts: {
          where: { id: { in: parsed.data.courtIds } },
          orderBy: courtDisplayOrder,
          select: { id: true, sport: true },
        },
      },
    });
    if (!hub || hub.courts.length !== parsed.data.courtIds.length) {
      return { kind: "missing" as const };
    }
    if (
      hub.courts.some(
        (court) => court.sport !== null && court.sport !== "pickleball"
      )
    ) {
      return { kind: "sport" as const };
    }
    const conflict = await findActiveCourtConflict(tx, parsed.data.courtIds);
    if (conflict) {
      return { kind: "conflict" as const, courtName: conflict.court.name };
    }
    const publicId = crypto.randomBytes(12).toString("base64url");
    const session = await tx.openPlaySession.create({
      data: {
        queue: {
          create: {
            publicId,
            hubId: hub.id,
            title: parsed.data.title,
            kind: "QUICK",
            createdById: workspace.actorId,
          },
        },
        runNumber: 1,
        status: "ACTIVE",
        matchingMode: parsed.data.matchingMode,
        createdById: workspace.actorId,
        startedAt: new Date(),
        upNextSlots: upNextSlotsFor(hub.courts.length),
        courts: {
          create: hub.courts.map((court, position) => ({
            courtId: court.id,
            position,
          })),
        },
      },
      select: { id: true },
    });
    return { kind: "created" as const, sessionId: session.id, publicId };
  });
  if (created.kind === "missing") {
    return { message: "One or more selected courts are unavailable." };
  }
  if (created.kind === "sport") {
    return { message: "Quick Queue requires pickleball courts." };
  }
  if (created.kind === "conflict") {
    return { message: `${created.courtName} is already assigned to another active BunalQ.` };
  }
  await audit(workspace, "BUNALQ_QUICK_CREATED", created.sessionId, {
    publicId: created.publicId,
  });
  refresh(created.publicId);
  redirect(`/dashboard/bunalq/${created.publicId}`);
}

export async function createGuestQuickQueueAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const parsed = guestQuickQueueSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    courtCount: String(formData.get("courtCount") ?? ""),
    matchingMode: String(formData.get("matchingMode") ?? "BALANCED"),
  });
  if (!parsed.success) {
    return { message: "Enter a queue name and choose between 1 and 12 courts." };
  }

  const context = await getSecurityRequestContext();
  if (!(await consumeRateLimit({
    namespace: "guest-bunalq-create",
    subject: context.ipHash,
    limit: 3,
    windowSeconds: 24 * 60 * 60,
    blockSeconds: 24 * 60 * 60,
  }))) {
    return { message: "This connection has created too many BunalQ rooms today." };
  }
  if (!(await consumeRateLimit({
    namespace: "guest-bunalq-create-global",
    subject: "all",
    limit: 100,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
  }))) {
    return { message: "Guest BunalQ creation is temporarily busy. Try again later." };
  }

  const currentWorkspace = await getGuestBunalQWorkspace();
  const credential = currentWorkspace ? null : createGuestBunalQCredential();
  const expiresAt = new Date(Date.now() + GUEST_BUNALQ_SESSION_MS);
  const publicId = crypto.randomBytes(12).toString("base64url");
  const courtRows = Array.from({ length: parsed.data.courtCount }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Court ${index + 1}`,
  }));

  const created = await bunalQTransaction(async (tx) => {
    let ownerId = currentWorkspace?.partnerId;
    let organizerSessionId = currentWorkspace?.organizerSessionId;
    if (organizerSessionId && ownerId) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "GuestBunalQOrganizerSession" WHERE "id" = ${organizerSessionId} FOR UPDATE`
      );
      const organizer = await tx.guestBunalQOrganizerSession.findFirst({
        where: {
          id: organizerSessionId,
          userId: ownerId,
          expiresAt: { gt: new Date() },
          user: { isGuestBunalQOrganizer: true },
        },
        select: { id: true },
      });
      if (!organizer) return { kind: "access-lost" as const };
      await tx.guestBunalQOrganizerSession.update({
        where: { id: organizer.id },
        data: { expiresAt, lastSeenAt: new Date() },
      });
    } else {
      ownerId = crypto.randomUUID();
      organizerSessionId = crypto.randomUUID();
      await tx.user.create({
        data: {
          id: ownerId,
          email: `guest-bunalq-${crypto.randomBytes(16).toString("hex")}@internal.bunal.club`,
          role: "PLAYER",
          registrationCompletedAt: null,
          isGuestBunalQOrganizer: true,
          guestBunalQSession: {
            create: {
              id: organizerSessionId,
              tokenHash: credential!.tokenHash,
              expiresAt: credential!.expiresAt,
            },
          },
        },
      });
    }

    const activeQueues = await tx.openPlayQueue.count({
      where: {
        hub: { ownerId, guestBunalQOnly: true },
        sessions: { some: { status: { in: ["SETUP", "ACTIVE"] } } },
      },
    });
    if (activeQueues >= 3) return { kind: "active-limit" as const };

    const hub = await tx.hub.create({
      data: {
        ownerId,
        name: parsed.data.title,
        coverPhotos: [],
        games: ["pickleball"],
        guestBunalQOnly: true,
        courts: {
          create: courtRows.map((court, sortOrder) => ({
            id: court.id,
            name: court.name,
            sport: "pickleball",
            sortOrder,
          })),
        },
      },
      select: { id: true },
    });
    const session = await tx.openPlaySession.create({
      data: {
        queue: {
          create: {
            publicId,
            hubId: hub.id,
            title: parsed.data.title,
            kind: "QUICK",
            directoryListed: false,
            createdById: ownerId,
          },
        },
        runNumber: 1,
        status: "ACTIVE",
        matchingMode: parsed.data.matchingMode,
        createdById: ownerId,
        startedAt: new Date(),
        upNextSlots: upNextSlotsFor(courtRows.length),
        courts: {
          create: courtRows.map((court, position) => ({
            courtId: court.id,
            position,
          })),
        },
      },
      select: { id: true },
    });
    await tx.partnerStaffActivity.create({
      data: {
        partnerId: ownerId,
        actorId: ownerId,
        action: "BUNALQ_GUEST_CREATED",
        targetType: "OpenPlaySession",
        targetId: session.id,
        metadata: { publicId, courtCount: parsed.data.courtCount },
      },
    });
    return {
      kind: "created" as const,
      publicId,
      rawToken: currentWorkspace?.credentialToken ?? credential!.rawToken,
      cookieExpiresAt: currentWorkspace ? expiresAt : credential!.expiresAt,
    };
  });

  if (created.kind === "access-lost") {
    return { message: "Organizer access expired. Reload this page and try again." };
  }
  if (created.kind === "active-limit") {
    return { message: "This browser already manages three active BunalQ rooms." };
  }
  await setGuestBunalQOrganizerCookie(created.rawToken, created.cookieExpiresAt);
  refresh(created.publicId);
  redirect(`/bunalq/manage/${created.publicId}`);
}

// Only organizers add players. Approve and Reject remain for requests sent
// before public self-join was removed, so none are left stranded.
async function moderatePendingGuest(
  formData: FormData,
  operation: "APPROVE" | "REJECT"
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || !participantId) return { message: "Guest request not found." };
  const changed = await bunalQTransaction(async (tx) => {
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
      await bumpLiveRevision(tx, sessionId);
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
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
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
  const changed = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, parsed.data.sessionId);
    if (!session || session.status === "ENDED") return false;
    const participant = await tx.openPlayParticipant.findFirst({
      where: {
        id: parsed.data.participantId,
        sessionId: parsed.data.sessionId,
        status: { not: "REMOVED" },
      },
      select: { id: true },
    });
    if (!participant) return false;
    await tx.openPlayParticipant.update({
      where: { id: participant.id },
      data: {
        displayName: parsed.data.displayName,
        skillLevel: parsed.data.skillLevel,
        // The operator's skill pick now drives team balancing for this run.
        duprRating: null,
        detailsOverridden: true,
      },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId: parsed.data.sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, parsed.data.sessionId);
    return true;
  });
  if (!changed) return { message: "Player not found." };
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || !participantId) return { message: "Player not found." };
  const changed = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return false;
    const participant = await tx.openPlayParticipant.findFirst({
      where: {
        id: participantId,
        sessionId,
        status: { notIn: ["STAGED", "PLAYING", "REMOVED"] },
      },
      select: { id: true, pairId: true },
    });
    if (!participant) return false;
    if (participant.pairId) {
      await dissolvePairs(tx, sessionId, [participant.pairId]);
    }
    await tx.openPlayParticipant.update({
      where: { id: participant.id },
      data: {
        status: "REMOVED",
        queuePosition: null,
        queuedAt: null,
        pairId: null,
      },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return true;
  });
  if (!changed) {
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantIds = [...new Set(formData.getAll("participantId").map(String))].slice(0, 100);
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || participantIds.length === 0) return { message: "Select players to check in." };
  const count = await bunalQTransaction(async (tx) => {
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
    if (participants.length > 0) {
      const queuedPlayers = participants.map((participant, index) =>
        Prisma.sql`(${participant.id}, ${position + index + 1})`
      );
      position += participants.length;
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "OpenPlayParticipant" AS participant
          SET
            "status" = 'QUEUED',
            "queuePosition" = selected."queuePosition",
            "checkedInAt" = ${now},
            "queuedAt" = ${now},
            "updatedAt" = ${now}
          FROM (VALUES ${Prisma.join(queuedPlayers)})
            AS selected("id", "queuePosition")
          WHERE participant."id" = selected."id"
            AND participant."sessionId" = ${sessionId}
        `
      );
      await tx.openPlaySession.update({
        where: { id: sessionId },
        data: {
          nextQueuePosition: position,
          liveRevision: { increment: 1 },
        },
      });
      await syncAutomaticOpenPlayUpNext(tx, {
        sessionId,
        createdById: workspace.actorId,
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantIds = [
    ...new Set(formData.getAll("participantId").map(String)),
  ].slice(0, 100);
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || participantIds.length === 0) {
    return { message: "Select waiting players to move to break." };
  }
  const count = await bunalQTransaction(async (tx) => {
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
    if (changed.count > 0) await bumpLiveRevision(tx, sessionId);
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const participantIds = [
    ...new Set(formData.getAll("participantId").map(String)),
  ].slice(0, 100);
  const owned = await ownedSession(sessionId, workspace);
  if (!owned || participantIds.length === 0) {
    return { message: "Select players to remove." };
  }
  const count = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status === "ENDED") return 0;
    const participants = await tx.openPlayParticipant.findMany({
      where: {
        sessionId,
        id: { in: participantIds },
        status: {
          in: ["NOT_CHECKED_IN", "CHECKED_OUT", "QUEUED", "PAUSED"],
        },
      },
      select: { id: true, pairId: true },
    });
    if (participants.length === 0) return 0;
    await dissolvePairs(
      tx,
      sessionId,
      participants.flatMap((participant) =>
        participant.pairId ? [participant.pairId] : []
      )
    );
    const changed = await tx.openPlayParticipant.updateMany({
      where: { id: { in: participants.map((participant) => participant.id) } },
      data: {
        status: "REMOVED",
        queuePosition: null,
        queuedAt: null,
        pairId: null,
      },
    });
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
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
  const workspace = await workspaceForManage(String(formData.get("sessionId") ?? ""));
  if (!workspace) return { message: "BunalQ manage access is required." };
  const sessionId = String(formData.get("sessionId") ?? "");
  const owned = await ownedSession(sessionId, workspace);
  if (!owned) return { message: "BunalQ run not found." };
  const created = await bunalQTransaction(async (tx) => {
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
        where: {
          sessionId,
          status: { notIn: ["REMOVED", "PENDING_APPROVAL"] },
          NOT: {
            source: "PUBLIC_GUEST",
            checkedInAt: null,
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const quick = previous.queue.kind === "QUICK";
    if (quick) {
      const courtIds = courts.map((court) => court.courtId);
      await lockCourtAssignments(tx, courtIds);
      const conflict = await findActiveCourtConflict(tx, courtIds);
      if (conflict) {
        return {
          kind: "court-conflict" as const,
          courtName: conflict.court.name,
        };
      }
    }
    const next = await tx.openPlaySession.create({
      data: {
        queueId: previous.queueId,
        runNumber: previous.runNumber + 1,
        status: quick ? "ACTIVE" : "SETUP",
        matchingMode: previous.matchingMode,
        createdById: workspace.actorId,
        startedAt: quick ? new Date() : null,
        upNextSlots: upNextSlotsFor(courts.length),
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
          duprRating: participant.duprRating,
          status: "NOT_CHECKED_IN" as const,
        })),
        skipDuplicates: true,
      });
    }
    if (previous.queue.event) {
      await syncRosterRows(tx, next.id, previous.queue.event.id);
    }
    return { kind: "created" as const, ...next };
  });
  if (!created) return { message: "Only the latest ended run can start a new run." };
  if (created.kind === "court-conflict") {
    return {
      message: `${created.courtName} is already assigned to another active BunalQ.`,
    };
  }
  await audit(workspace, "BUNALQ_RUN_CREATED", created.id, {
    previousSessionId: sessionId,
    runNumber: created.runNumber,
  });
  refresh(owned.queue.publicId, owned.queue.event?.publicId);
  return { success: `Run ${created.runNumber} is ready.` };
}
