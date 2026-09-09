"use server";

import crypto from "node:crypto";
import {
  type OpenPlayAdmissionMode,
  type OpenPlayMatchingMode,
  type OpenPlayParticipantStatus,
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
  cancelOpenPlayUpNextGame,
  canTransitionParticipant,
  getOpenPlayWorkspace,
  syncAutomaticOpenPlayUpNext,
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

async function bumpLiveRevision(tx: Tx, sessionId: string) {
  await tx.openPlaySession.update({
    where: { id: sessionId },
    data: { liveRevision: { increment: 1 } },
  });
}

async function lockCourtAssignments(tx: Tx, courtIds: string[]) {
  for (const courtId of [...new Set(courtIds)].sort()) {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${courtId}))`
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
  workspace: PartnerWorkspace,
  action: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue
) {
  try {
    await recordPartnerActivity({
      workspace,
      action,
      targetType: "OpenPlaySession",
      targetId,
      metadata,
    });
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
        privateProfile: registration.user?.privateProfile ?? false,
      },
    ])
  );
  const guestDetails = new Map(
    registrations.flatMap((registration) =>
      registration.guests.map((guest) => [
        guest.id,
        { displayName: guest.name, skillLevel: DEFAULT_SKILL_LEVEL },
      ] as const)
    )
  );
  const organizerDetails = new Map(
    organizerGuests.map((guest) => [
      guest.id,
      { displayName: guest.name, skillLevel: DEFAULT_SKILL_LEVEL },
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
    if (
      (mustMaskPrivate && participant.displayName !== "Private player") ||
      (!participant.detailsOverridden &&
        (participant.displayName !== details.displayName ||
          participant.skillLevel !== details.skillLevel))
    ) {
      await tx.openPlayParticipant.update({
        where: { id: participant.id },
        data: {
          displayName: mustMaskPrivate ? "Private player" : details.displayName,
          ...(!participant.detailsOverridden
            ? { skillLevel: details.skillLevel }
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
  const workspace = await workspaceForManage();
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
  const participant = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, parsed.data.sessionId);
    if (!session || session.status === "ENDED") return null;
    const created = await tx.openPlayParticipant.create({
      data: {
        sessionId: session.id,
        source: "WALK_IN",
        displayName: parsed.data.displayName,
        skillLevel: parsed.data.skillLevel,
      },
      select: { id: true },
    });
    await bumpLiveRevision(tx, session.id);
    return created;
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
    let refreshedUpNext = false;
    if (operation === "PAUSE" && participant.status === "STAGED") {
      const stagedGame = await tx.openPlayGame.findFirst({
        where: {
          sessionId,
          status: "STAGED",
          players: { some: { participantId: participant.id } },
        },
        select: { id: true },
      });
      if (
        !stagedGame ||
        !(await cancelOpenPlayUpNextGame(tx, sessionId, stagedGame.id))
      ) {
        return { message: "That upcoming match is no longer available." };
      }
      refreshedUpNext = true;
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
    await syncAutomaticOpenPlayUpNext(tx, {
      sessionId,
      createdById: workspace.actorId,
    });
    await bumpLiveRevision(tx, sessionId);
    return {
      queuePublicId: session.queue.publicId,
      eventPublicId: session.queue.event?.publicId ?? null,
      refreshedUpNext,
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
  return {
    success: result.refreshedUpNext
      ? "Player sat out; Up next was updated automatically."
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

export async function startOpenPlaySessionAction(
  _previous: OpenPlayActionState,
  formData: FormData
): Promise<OpenPlayActionState> {
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
      select: { courtId: true },
    });
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
  const completed = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const game = await tx.openPlayGame.findFirst({
      where: { id: gameId, sessionId, status: "ACTIVE" },
      include: { players: true },
    });
    if (!game || !game.courtId || game.players.length !== 4) return null;
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
      game.players.some(
        (slot) => !["QUEUED", "STAGED"].includes(slot.participant.status)
      )
    ) return false;
    const newerStarted = await tx.openPlayGame.count({
      where: {
        sessionId,
        courtId: game.courtId,
        startedAt: { gt: game.startedAt },
        status: { in: ["ACTIVE", "COMPLETED"] },
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
  const workspace = await workspaceForManage();
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
    admissionMode: String(formData.get("admissionMode") ?? "APPROVAL_REQUIRED"),
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
          orderBy: { createdAt: "asc" },
          select: { id: true, sport: true },
        },
      },
    });
    if (!hub || hub.courts.length !== parsed.data.courtIds.length) {
      return { kind: "missing" as const };
    }
    if (hub.courts.some((court) => court.sport !== "pickleball")) {
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
  const updated = await bunalQTransaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session || session.queue.kind !== "QUICK") return 0;
    const result = await tx.openPlayQueue.updateMany({
      where: {
        id: session.queueId,
        kind: "QUICK",
        hub: { ownerId: workspace.partnerId },
      },
      data: { admissionMode },
    });
    if (result.count === 1) await bumpLiveRevision(tx, sessionId);
    return result.count;
  });
  if (updated !== 1) {
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
  if (!(await consumeRateLimit({
    namespace: "bunalq-public-join-queue",
    subject: parsed.data.publicId,
    limit: 60,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  }))) {
    return { message: "This queue is receiving too many join requests. Try again later." };
  }
  const result = await bunalQTransaction(async (tx) => {
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
    const session = await lockSession(tx, current.id);
    if (
      !session ||
      session.status !== "ACTIVE" ||
      session.queue.kind !== "QUICK"
    ) {
      return { kind: "closed" as const };
    }
    const [rosterCount, publicGuestCount] = await Promise.all([
      tx.openPlayParticipant.count({
        where: {
          sessionId: session.id,
          status: { notIn: ["REMOVED", "CHECKED_OUT"] },
        },
      }),
      tx.openPlayParticipant.count({
        where: { sessionId: session.id, source: "PUBLIC_GUEST" },
      }),
    ]);
    if (rosterCount >= 100) return { kind: "full" as const };
    if (publicGuestCount >= 250) return { kind: "exhausted" as const };
    const duplicate = await tx.openPlayParticipant.findFirst({
      where: {
        sessionId: session.id,
        source: "PUBLIC_GUEST",
        status: { notIn: ["REMOVED", "CHECKED_OUT"] },
        displayName: {
          equals: parsed.data.displayName,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (duplicate) return { kind: "duplicate" as const };
    let queuePosition: number | null = null;
    if (session.queue.admissionMode === "INSTANT") {
      const positionedSession = await tx.openPlaySession.update({
        where: { id: session.id },
        data: { nextQueuePosition: { increment: 1 } },
        select: { nextQueuePosition: true },
      });
      queuePosition = positionedSession.nextQueuePosition;
    }
    const participant = await tx.openPlayParticipant.create({
      data: {
        sessionId: session.id,
        source: "PUBLIC_GUEST",
        displayName: parsed.data.displayName,
        skillLevel: parsed.data.skillLevel,
        status:
          session.queue.admissionMode === "INSTANT"
            ? "QUEUED"
            : "PENDING_APPROVAL",
        queuePosition,
        checkedInAt: queuePosition ? new Date() : null,
        queuedAt: queuePosition ? new Date() : null,
      },
      select: { id: true },
    });
    if (session.queue.admissionMode === "INSTANT") {
      await syncAutomaticOpenPlayUpNext(tx, {
        sessionId: session.id,
        createdById: null,
      });
    }
    await tx.partnerStaffActivity.create({
      data: {
        partnerId: queue.hub.ownerId,
        actorId: null,
        action: "BUNALQ_PUBLIC_GUEST_SUBMITTED",
        targetType: "OpenPlayParticipant",
        targetId: participant.id,
        metadata: { admissionMode: session.queue.admissionMode },
      },
    });
    await bumpLiveRevision(tx, session.id);
    return {
      kind: "joined" as const,
      admissionMode: session.queue.admissionMode,
    };
  });
  if (result.kind === "closed") return { message: "This Quick Queue is not accepting players." };
  if (result.kind === "full") return { message: "This Quick Queue has reached its roster limit." };
  if (result.kind === "exhausted") {
    return { message: "This run has reached its public join limit. Ask the organizer to start a new run." };
  }
  if (result.kind === "duplicate") {
    return { message: "A player with that name is already in this queue." };
  }
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
  const workspace = await workspaceForManage();
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
