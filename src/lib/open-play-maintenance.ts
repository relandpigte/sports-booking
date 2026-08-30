import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const EVENT_RUN_END_GRACE_MS = 60 * 60_000;
export const QUICK_QUEUE_INACTIVITY_MS = 12 * 60 * 60_000;

type CleanupReason = "EVENT_END_GRACE_EXPIRED" | "QUICK_QUEUE_INACTIVE";

async function closeStaleSession(
  sessionId: string,
  now: Date
): Promise<CleanupReason | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OpenPlaySession" WHERE "id" = ${sessionId} FOR UPDATE`
    );
    const session = await tx.openPlaySession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
        queue: {
          select: {
            kind: true,
            updatedAt: true,
            hub: { select: { ownerId: true } },
            event: { select: { endsAt: true } },
          },
        },
        participants: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
        games: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { updatedAt: true },
        },
      },
    });
    if (!session || session.status === "ENDED") return null;

    let reason: CleanupReason;
    if (session.queue.kind === "EVENT") {
      const endsAt = session.queue.event?.endsAt;
      if (!endsAt || endsAt.getTime() + EVENT_RUN_END_GRACE_MS > now.getTime()) {
        return null;
      }
      reason = "EVENT_END_GRACE_EXPIRED";
    } else {
      if (session.status !== "ACTIVE") return null;
      const latestActivity = Math.max(
        session.createdAt.getTime(),
        session.startedAt?.getTime() ?? 0,
        session.updatedAt.getTime(),
        session.queue.updatedAt.getTime(),
        session.participants[0]?.updatedAt.getTime() ?? 0,
        session.games[0]?.updatedAt.getTime() ?? 0
      );
      if (latestActivity + QUICK_QUEUE_INACTIVITY_MS > now.getTime()) {
        return null;
      }
      reason = "QUICK_QUEUE_INACTIVE";
    }

    await tx.openPlayGame.updateMany({
      where: { sessionId, status: { in: ["STAGED", "ACTIVE"] } },
      data: { status: "CANCELLED", cancelledAt: now },
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
      where: { id: sessionId },
      data: { status: "ENDED", endedAt: now },
    });
    await tx.partnerStaffActivity.create({
      data: {
        partnerId: session.queue.hub.ownerId,
        actorId: null,
        action: "BUNALQ_AUTO_ENDED",
        targetType: "OpenPlaySession",
        targetId: sessionId,
        metadata: {
          reason,
          closedAt: now.toISOString(),
        },
      },
    });
    return reason;
  });
}

export async function cleanupStaleOpenPlaySessions({
  now = new Date(),
  sessionIds,
}: {
  now?: Date;
  sessionIds?: string[];
} = {}) {
  if (sessionIds && sessionIds.length === 0) {
    return { eventRuns: 0, quickQueues: 0 };
  }
  const eventCutoff = new Date(now.getTime() - EVENT_RUN_END_GRACE_MS);
  const quickCutoff = new Date(now.getTime() - QUICK_QUEUE_INACTIVITY_MS);
  const candidates = await prisma.openPlaySession.findMany({
    where: {
      ...(sessionIds ? { id: { in: sessionIds } } : {}),
      OR: [
        {
          status: { in: ["SETUP", "ACTIVE"] },
          queue: {
            kind: "EVENT",
            event: { endsAt: { lte: eventCutoff } },
          },
        },
        {
          status: "ACTIVE",
          startedAt: { lte: quickCutoff },
          queue: { kind: "QUICK" },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: { id: true },
  });

  let eventRuns = 0;
  let quickQueues = 0;
  for (const candidate of candidates) {
    const reason = await closeStaleSession(candidate.id, now);
    if (reason === "EVENT_END_GRACE_EXPIRED") eventRuns += 1;
    if (reason === "QUICK_QUEUE_INACTIVE") quickQueues += 1;
  }
  return { eventRuns, quickQueues };
}
