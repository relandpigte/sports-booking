import "server-only";

import { randomUUID } from "node:crypto";
import {
  Prisma,
  type ChatConversationKind,
  type ChatMessageKind,
  type Role,
} from "@prisma/client";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { publishMessageEvent } from "@/lib/messages-realtime";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { getPartnerWorkspace, hasStaffAccess } from "@/lib/staffing";

export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_GRACE_MS = 24 * 60 * 60_000;

const MessageBodySchema = z
  .string()
  .trim()
  .min(1, { error: "Write a message first." })
  .max(2000, { error: "Keep messages to 2,000 characters or fewer." });

const ClientNonceSchema = z
  .string()
  .trim()
  .min(8)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const SendMessageSchema = z.object({
  body: MessageBodySchema,
  clientNonce: ClientNonceSchema,
});

export const EditMessageSchema = z.object({ body: MessageBodySchema });

export const ReportMessageSchema = z.object({
  messageId: z.string().min(1),
  category: z.enum(["SPAM", "HARASSMENT", "INAPPROPRIATE", "OTHER"]),
  details: z.string().trim().max(500).optional(),
});

type MessageViewer = {
  id: string;
  actorId: string;
  name: string | null;
  playerName: string | null;
  image: string | null;
  role: Role;
  partnerStatus: "DRAFT" | "PENDING" | "ACTIVE" | "DEACTIVATED" | null;
  chatRestrictedAt: Date | null;
  canSend: boolean;
};

export type MessageConversationSummary = {
  id: string;
  kind: ChatConversationKind;
  title: string;
  subtitle: string;
  image: string | null;
  href: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type MessageView = {
  id: string;
  kind: "USER" | "SYSTEM";
  body: string | null;
  targetPath: string | null;
  sender: {
    id: string;
    name: string;
    image: string | null;
  } | null;
  mine: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type ConversationDetails = {
  id: string;
  kind: ChatConversationKind;
  title: string;
  subtitle: string;
  image: string | null;
  restricted: boolean;
  blocked: boolean;
  context: {
    eyebrow: string;
    title: string;
    schedule: string;
    venue: string;
    note: string | null;
    href: string;
    hrefLabel: string;
  };
  participants: Array<{
    id: string;
    name: string;
    image: string | null;
    role: "PLAYER" | "PARTNER";
    blockedByMe: boolean;
  }>;
  blockedByMe: boolean;
};

type BookingContextSource = {
  id: string;
  date: string;
  startHour: number;
  endHour: number;
  startsAt: Date;
  endsAt: Date;
  court: { name: string };
};

type ConversationAccess = {
  conversationId: string;
  visibleFrom: Date;
  conversation: NonNullable<Awaited<ReturnType<typeof loadConversation>>>;
  bookingContext: BookingContextSource | null;
  qualifyingBookingCount: number;
};

function cutoff(now = new Date()): Date {
  return new Date(now.getTime() - MESSAGE_GRACE_MS);
}

function displayName(user: {
  playerName: string | null;
  name: string | null;
}): string {
  return user.playerName ?? user.name ?? "Member";
}

function selectBookingContext(
  bookings: BookingContextSource[],
  now: Date
): BookingContextSource | null {
  const upcoming = bookings
    .filter((booking) => booking.startsAt >= now)
    .sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime()
    );
  if (upcoming[0]) return upcoming[0];
  return (
    [...bookings].sort(
      (left, right) => right.endsAt.getTime() - left.endsAt.getTime()
    )[0] ?? null
  );
}

async function messageViewer(): Promise<MessageViewer | null> {
  const user = await getAuthenticatedUser();
  if (!user || user.role === "ADMIN") return null;
  if (user.role === "PARTNER" && user.partnerStatus !== "ACTIVE") return null;
  const workspace = user.role === "PLAYER" ? await getPartnerWorkspace() : null;
  if (workspace) {
    if (!hasStaffAccess(workspace, "messages", "VIEW")) return null;
    return {
      ...user,
      id: workspace.partnerId,
      actorId: user.id,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      canSend: hasStaffAccess(workspace, "messages", "MANAGE"),
    };
  }
  return { ...user, actorId: user.id, canSend: true };
}

async function recordStaffMessageActivity(
  viewer: MessageViewer,
  action: string,
  targetType: string,
  targetId: string
) {
  if (viewer.actorId === viewer.id) return;
  await prisma.partnerStaffActivity.create({
    data: {
      partnerId: viewer.id,
      actorId: viewer.actorId,
      action,
      targetType,
      targetId,
    },
  });
}

export async function getMessageViewer(): Promise<MessageViewer | null> {
  return messageViewer();
}

const conversationSelect = {
  id: true,
  kind: true,
  hubId: true,
  eventId: true,
  trainerSessionId: true,
  playerId: true,
  createdAt: true,
  lastMessageAt: true,
  hub: {
    select: {
      id: true,
      name: true,
      logo: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          playerName: true,
          image: true,
          partnerStatus: true,
        },
      },
    },
  },
  event: {
    select: {
      id: true,
      publicId: true,
      title: true,
      sport: true,
      date: true,
      startHour: true,
      endHour: true,
      status: true,
      endsAt: true,
      hub: {
        select: {
          id: true,
          name: true,
          logo: true,
          ownerId: true,
          owner: {
            select: {
              id: true,
              name: true,
              playerName: true,
              image: true,
              partnerStatus: true,
            },
          },
        },
      },
    },
  },
  trainerSession: {
    select: {
      id: true,
      date: true,
      startHour: true,
      endHour: true,
      endsAt: true,
      status: true,
      confirmedAt: true,
      playerId: true,
      player: { select: { id: true, name: true, playerName: true, image: true } },
      trainer: {
        select: {
          area: true,
          userId: true,
          user: { select: { id: true, name: true, playerName: true, image: true } },
        },
      },
    },
  },
  player: {
    select: {
      id: true,
      name: true,
      playerName: true,
      image: true,
    },
  },
} satisfies Prisma.ChatConversationSelect;

async function loadConversation(id: string) {
  return prisma.chatConversation.findUnique({
    where: { id },
    select: conversationSelect,
  });
}

async function accessConversation(
  conversationId: string,
  viewer: MessageViewer,
  now = new Date()
): Promise<ConversationAccess | null> {
  const conversation = await loadConversation(conversationId);
  if (!conversation) return null;
  const activeAfter = cutoff(now);

  if (conversation.kind === "HUB_PLAYER") {
    if (!conversation.hubId || !conversation.playerId || !conversation.hub) {
      return null;
    }
    const isPlayer = viewer.id === conversation.playerId && viewer.role === "PLAYER";
    const isPartner =
      viewer.role === "PARTNER" &&
      viewer.id === conversation.hub.ownerId &&
      conversation.hub.owner.partnerStatus === "ACTIVE";
    if (!isPlayer && !isPartner) return null;

    const [activeBookings, firstBooking] = await Promise.all([
      prisma.booking.findMany({
        where: {
          hubId: conversation.hubId,
          userId: conversation.playerId,
          status: "CONFIRMED",
          endsAt: { gt: activeAfter },
        },
        select: {
          id: true,
          date: true,
          startHour: true,
          endHour: true,
          startsAt: true,
          endsAt: true,
          court: { select: { name: true } },
        },
      }),
      prisma.booking.findFirst({
        where: {
          hubId: conversation.hubId,
          userId: conversation.playerId,
          status: "CONFIRMED",
        },
        orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }],
        select: { confirmedAt: true, createdAt: true },
      }),
    ]);
    const bookingContext = selectBookingContext(activeBookings, now);
    if (!bookingContext || !firstBooking) return null;
    return {
      conversationId,
      visibleFrom: isPartner
        ? conversation.createdAt
        : (firstBooking.confirmedAt ?? firstBooking.createdAt),
      conversation,
      bookingContext,
      qualifyingBookingCount: activeBookings.length,
    };
  }

  if (conversation.kind === "TRAINER_SESSION") {
    const session = conversation.trainerSession;
    if (!session || !["CONFIRMED", "COMPLETED"].includes(session.status) || session.endsAt <= activeAfter) {
      return null;
    }
    if (viewer.role !== "PLAYER" || (viewer.id !== session.playerId && viewer.id !== session.trainer.userId)) {
      return null;
    }
    return {
      conversationId,
      visibleFrom: session.confirmedAt ?? conversation.createdAt,
      conversation,
      bookingContext: null,
      qualifyingBookingCount: 1,
    };
  }

  if (!conversation.eventId || !conversation.event) return null;
  if (
    conversation.event.status !== "PUBLISHED" ||
    conversation.event.endsAt <= activeAfter ||
    conversation.event.hub.owner.partnerStatus !== "ACTIVE"
  ) {
    return null;
  }
  const hasConfirmedPlayer = await prisma.eventRegistration.findFirst({
    where: { eventId: conversation.eventId, status: "CONFIRMED" },
    select: { id: true },
  });
  if (!hasConfirmedPlayer) return null;

  if (
    viewer.role === "PARTNER" &&
    viewer.id === conversation.event.hub.ownerId
  ) {
    return {
      conversationId,
      visibleFrom: conversation.createdAt,
      conversation,
      bookingContext: null,
      qualifyingBookingCount: 0,
    };
  }
  if (viewer.role !== "PLAYER") return null;
  const registration = await prisma.eventRegistration.findUnique({
    where: {
      eventId_userId: { eventId: conversation.eventId, userId: viewer.id },
    },
    select: { status: true, confirmedAt: true, createdAt: true },
  });
  if (registration?.status !== "CONFIRMED") return null;
  return {
    conversationId,
    visibleFrom: registration.confirmedAt ?? registration.createdAt,
    conversation,
    bookingContext: null,
    qualifyingBookingCount: 0,
  };
}

async function listConversationAccesses(
  viewer: MessageViewer,
  now = new Date(),
  repairMissing = true
): Promise<ConversationAccess[]> {
  const activeAfter = cutoff(now);
  const [candidates, activeBookings, registrations, firstBookings] =
    await Promise.all([
    prisma.chatConversation.findMany({
      where:
        viewer.role === "PLAYER"
          ? {
              OR: [
                { kind: "HUB_PLAYER", playerId: viewer.id },
                {
                  kind: "EVENT",
                  event: {
                    registrations: {
                      some: { userId: viewer.id, status: "CONFIRMED" },
                    },
                  },
                },
                {
                  kind: "TRAINER_SESSION",
                  trainerSession: {
                    OR: [{ playerId: viewer.id }, { trainer: { userId: viewer.id } }],
                    status: { in: ["CONFIRMED", "COMPLETED"] },
                    endsAt: { gt: activeAfter },
                  },
                },
              ],
            }
          : { hub: { ownerId: viewer.id } },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      select: conversationSelect,
    }),
    prisma.booking.findMany({
      where: {
        ...(viewer.role === "PLAYER"
          ? {
              userId: viewer.id,
              hub: { owner: { partnerStatus: "ACTIVE" } },
            }
          : { hub: { ownerId: viewer.id }, userId: { not: null } }),
        status: "CONFIRMED",
        endsAt: { gt: activeAfter },
      },
      select: {
        id: true,
        hubId: true,
        userId: true,
        date: true,
        startHour: true,
        endHour: true,
        startsAt: true,
        endsAt: true,
        court: { select: { name: true } },
      },
    }),
    prisma.eventRegistration.findMany({
      where: {
        status: "CONFIRMED",
        ...(viewer.role === "PLAYER" ? { userId: viewer.id } : {}),
        event: {
          status: "PUBLISHED",
          endsAt: { gt: activeAfter },
          hub:
            viewer.role === "PLAYER"
              ? { owner: { partnerStatus: "ACTIVE" } }
              : { ownerId: viewer.id },
        },
      },
      select: {
        eventId: true,
        confirmedAt: true,
        createdAt: true,
        event: { select: { hubId: true } },
      },
    }),
    viewer.role === "PLAYER"
      ? prisma.booking.findMany({
          where: { userId: viewer.id, status: "CONFIRMED" },
          select: { hubId: true, confirmedAt: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  if (repairMissing) {
    const conversationPairs = new Set(
      candidates.flatMap((conversation) =>
        conversation.hubId && conversation.playerId
          ? [`${conversation.hubId}:${conversation.playerId}`]
          : []
      )
    );
    const conversationEventIds = new Set(
      candidates.flatMap((conversation) =>
        conversation.eventId ? [conversation.eventId] : []
      )
    );
    const missingPrivate = activeBookings.filter(
      (booking, index, rows) =>
        !conversationPairs.has(`${booking.hubId}:${booking.userId}`) &&
        rows.findIndex(
          (item) =>
            item.hubId === booking.hubId && item.userId === booking.userId
        ) === index
    );
    const missingEvents = registrations.filter(
      (registration, index, rows) =>
        !conversationEventIds.has(registration.eventId) &&
        rows.findIndex((item) => item.eventId === registration.eventId) === index
    );
    if (missingPrivate.length > 0 || missingEvents.length > 0) {
      await prisma.$transaction([
        ...missingPrivate.map((booking) =>
          prisma.chatConversation.upsert({
            where: {
              hubId_playerId: {
                hubId: booking.hubId,
                playerId: booking.userId!,
              },
            },
            create: {
              kind: "HUB_PLAYER",
              hubId: booking.hubId,
              playerId: booking.userId!,
            },
            update: {},
          })
        ),
        ...missingEvents.map((registration) =>
          prisma.chatConversation.upsert({
            where: { eventId: registration.eventId },
            create: {
              kind: "EVENT",
              eventId: registration.eventId,
              hubId: registration.event.hubId,
            },
            update: {},
          })
        ),
      ]);
      return listConversationAccesses(viewer, now, false);
    }
  }

  const activePrivatePairs = new Set(
    activeBookings.map((booking) => `${booking.hubId}:${booking.userId}`)
  );
  const firstBookingByHub = new Map<string, Date>();
  for (const booking of firstBookings) {
    const confirmedAt = booking.confirmedAt ?? booking.createdAt;
    const current = firstBookingByHub.get(booking.hubId);
    if (!current || confirmedAt < current) {
      firstBookingByHub.set(booking.hubId, confirmedAt);
    }
  }
  const registrationByEvent = new Map<string, Date>();
  for (const registration of registrations) {
    const confirmedAt = registration.confirmedAt ?? registration.createdAt;
    const current = registrationByEvent.get(registration.eventId);
    if (!current || confirmedAt < current) {
      registrationByEvent.set(registration.eventId, confirmedAt);
    }
  }

  const accesses: ConversationAccess[] = [];
  for (const conversation of candidates) {
    if (
      conversation.kind === "HUB_PLAYER" &&
      conversation.hubId &&
      conversation.playerId &&
      conversation.hub &&
      conversation.hub.owner.partnerStatus === "ACTIVE" &&
      activePrivatePairs.has(`${conversation.hubId}:${conversation.playerId}`)
    ) {
      const visibleFrom =
        viewer.role === "PARTNER"
          ? conversation.createdAt
          : firstBookingByHub.get(conversation.hubId);
      if (visibleFrom) {
        accesses.push({
          conversationId: conversation.id,
          visibleFrom,
          conversation,
          bookingContext: selectBookingContext(
            activeBookings.filter(
              (booking) =>
                booking.hubId === conversation.hubId &&
                booking.userId === conversation.playerId
            ),
            now
          ),
          qualifyingBookingCount: activeBookings.filter(
            (booking) =>
              booking.hubId === conversation.hubId &&
              booking.userId === conversation.playerId
          ).length,
        });
      }
      continue;
    }
    if (
      conversation.kind === "EVENT" &&
      conversation.eventId &&
      conversation.event?.status === "PUBLISHED" &&
      conversation.event.endsAt > activeAfter &&
      conversation.event.hub.owner.partnerStatus === "ACTIVE"
    ) {
      const confirmedAt = registrationByEvent.get(conversation.eventId);
      if (confirmedAt) {
        accesses.push({
          conversationId: conversation.id,
          visibleFrom:
            viewer.role === "PARTNER" ? conversation.createdAt : confirmedAt,
          conversation,
          bookingContext: null,
          qualifyingBookingCount: 0,
        });
      }
      continue;
    }
    if (
      conversation.kind === "TRAINER_SESSION" &&
      conversation.trainerSession &&
      ["CONFIRMED", "COMPLETED"].includes(conversation.trainerSession.status) &&
      conversation.trainerSession.endsAt > activeAfter &&
      (conversation.trainerSession.playerId === viewer.id || conversation.trainerSession.trainer.userId === viewer.id)
    ) {
      accesses.push({
        conversationId: conversation.id,
        visibleFrom: conversation.trainerSession.confirmedAt ?? conversation.createdAt,
        conversation,
        bookingContext: null,
        qualifyingBookingCount: 1,
      });
    }
  }
  return accesses;
}

async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.chatBlock.findMany({
    where: { blockerId: userId },
    select: { blockedId: true },
  });
  return rows.map((row) => row.blockedId);
}

function conversationPresentation(
  access: ConversationAccess,
  viewer: MessageViewer
) {
  const conversation = access.conversation;
  if (conversation.kind === "EVENT" && conversation.event) {
    return {
      title: conversation.event.title,
      subtitle: `${conversation.event.hub.name} · Event discussion`,
      image: conversation.event.hub.logo,
      href: `/dashboard/messages/conversations/${conversation.id}`,
    };
  }
  if (conversation.kind === "TRAINER_SESSION" && conversation.trainerSession) {
    const session = conversation.trainerSession;
    const other = viewer.id === session.playerId ? session.trainer.user : session.player;
    return {
      title: displayName(other),
      subtitle: `${session.trainer.area ?? "Trainer session"} · Training`,
      image: other.image,
      href: `/dashboard/messages/conversations/${conversation.id}`,
    };
  }
  if (!conversation.hub || !conversation.player) {
    return {
      title: "Venue conversation",
      subtitle: "Booking messages",
      image: null,
      href: `/dashboard/messages/conversations/${conversation.id}`,
    };
  }
  const other = viewer.role === "PLAYER" ? conversation.hub.owner : conversation.player;
  return {
    title: displayName(other),
    subtitle: `${conversation.hub.name} · Venue conversation`,
    image: other.image,
    href: `/dashboard/messages/conversations/${conversation.id}`,
  };
}

type ConversationActivity = {
  conversationId: string;
  body: string | null;
  kind: ChatMessageKind | null;
  deletedAt: Date | null;
  createdAt: Date | null;
  unreadCount: number;
};

async function conversationActivity(
  accesses: ConversationAccess[],
  viewerId: string,
  blockedIds: string[]
): Promise<Map<string, ConversationActivity>> {
  if (accesses.length === 0) return new Map();
  const visibleRows = accesses.map((access) =>
    Prisma.sql`(
      ${access.conversationId}::text,
      ${access.visibleFrom}::timestamp
    )`
  );
  const visibleSender =
    blockedIds.length > 0
      ? Prisma.sql`AND (
          message."senderId" IS NULL OR
          message."senderId" NOT IN (${Prisma.join(blockedIds)})
        )`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<ConversationActivity[]>(Prisma.sql`
    WITH visible("conversationId", "visibleFrom") AS (
      VALUES ${Prisma.join(visibleRows)}
    )
    SELECT
      visible."conversationId",
      latest."body",
      latest."kind"::text AS "kind",
      latest."deletedAt",
      latest."createdAt",
      COALESCE(unread."unreadCount", 0)::integer AS "unreadCount"
    FROM visible
    LEFT JOIN "ChatReadState" AS read_state ON
      read_state."conversationId" = visible."conversationId" AND
      read_state."userId" = ${viewerId}
    LEFT JOIN LATERAL (
      SELECT
        message."body",
        message."kind",
        message."deletedAt",
        message."createdAt"
      FROM "ChatMessage" AS message
      WHERE
        message."conversationId" = visible."conversationId" AND
        message."createdAt" >= visible."visibleFrom"
        ${visibleSender}
      ORDER BY message."createdAt" DESC, message."id" DESC
      LIMIT 1
    ) AS latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS "unreadCount"
      FROM "ChatMessage" AS message
      WHERE
        message."conversationId" = visible."conversationId" AND
        message."createdAt" >= visible."visibleFrom" AND
        message."createdAt" > COALESCE(
          read_state."lastReadAt",
          visible."visibleFrom"
        ) AND
        (message."senderId" IS NULL OR message."senderId" <> ${viewerId})
        ${visibleSender}
    ) AS unread ON TRUE
  `);
  return new Map(rows.map((row) => [row.conversationId, row]));
}

async function loadConversationList(viewer: MessageViewer) {
  const [accesses, blockedIds] = await Promise.all([
    listConversationAccesses(viewer),
    blockedUserIds(viewer.actorId),
  ]);
  const activity = await conversationActivity(accesses, viewer.actorId, blockedIds);
  const conversations = accesses.map((access) => {
    const latest = activity.get(access.conversationId);
    const presentation = conversationPresentation(access, viewer);
    return {
      id: access.conversationId,
      kind: access.conversation.kind,
      ...presentation,
      lastMessage: latest?.createdAt
        ? latest.deletedAt
          ? "Message deleted"
          : latest.body
        : null,
      lastMessageAt: latest?.createdAt?.toISOString() ?? null,
      unreadCount: latest?.unreadCount ?? 0,
    } satisfies MessageConversationSummary;
  });
  conversations.sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")
  );
  return {
    accesses,
    blockedIds,
    conversations,
    totalUnread: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
  };
}

export async function listMessageConversations(): Promise<{
  viewer: MessageViewer;
  conversations: MessageConversationSummary[];
  totalUnread: number;
} | null> {
  const viewer = await messageViewer();
  if (!viewer) return null;
  const loaded = await loadConversationList(viewer);
  return {
    viewer,
    conversations: loaded.conversations,
    totalUnread: loaded.totalUnread,
  };
}

export async function hasMessageAccess(args: {
  userId: string;
  role: Role;
  partnerStatus: MessageViewer["partnerStatus"];
}): Promise<boolean> {
  if (args.role === "ADMIN") return false;
  if (args.role === "PLAYER") return true;
  return args.role === "PARTNER" && args.partnerStatus === "ACTIVE";
}

async function conversationDetailsForViewer(
  access: ConversationAccess,
  viewer: MessageViewer,
  myBlockedIds: string[]
): Promise<ConversationDetails> {
  const conversationId = access.conversationId;
  const presentation = conversationPresentation(access, viewer);
  const conversation = access.conversation;
  const context =
    conversation.kind === "EVENT" && conversation.event
      ? {
          eyebrow: "Event",
          title: conversation.event.title,
          schedule: `${formatManilaDateLong(
            conversation.event.date
          )}, ${formatSlotRange(
            conversation.event.startHour,
            conversation.event.endHour
          )}`,
          venue: `${conversation.event.hub.name} · ${conversation.event.sport}`,
          note: "Only confirmed participants can access this discussion.",
          href: `/events/${conversation.event.publicId}`,
          hrefLabel: "View event",
        }
      : conversation.kind === "TRAINER_SESSION" && conversation.trainerSession
        ? {
            eyebrow: "Trainer session",
            title: displayName(conversation.trainerSession.trainer.user),
            schedule: `${formatManilaDateLong(conversation.trainerSession.date)}, ${formatSlotRange(conversation.trainerSession.startHour, conversation.trainerSession.endHour)}`,
            venue: conversation.trainerSession.trainer.area ?? "Trainer-arranged location",
            note: "Only the player and trainer can access this paid-session conversation.",
            href: "/dashboard/bookings?type=trainers",
            hrefLabel: "View session",
          }
      : access.bookingContext && conversation.hub
        ? {
            eyebrow: "Court booking",
            title: access.bookingContext.court.name,
            schedule: `${formatManilaDateLong(
              access.bookingContext.date
            )}, ${formatSlotRange(
              access.bookingContext.startHour,
              access.bookingContext.endHour
            )}`,
            venue: conversation.hub.name,
            note:
              access.qualifyingBookingCount > 1
                ? `${access.qualifyingBookingCount} qualifying bookings use this conversation.`
                : "This conversation is reused for future bookings at this venue.",
            href: `/dashboard/bookings?q=${encodeURIComponent(
              access.bookingContext.id
            )}`,
            hrefLabel: "View booking",
          }
        : {
            eyebrow: "Booking",
            title: conversation.hub?.name ?? "Venue booking",
            schedule: "Confirmed booking",
            venue: conversation.hub?.name ?? "Venue",
            note: null,
            href: "/dashboard/bookings",
            hrefLabel: "View bookings",
          };
  const participants: ConversationDetails["participants"] = [];
  if (conversation.kind === "HUB_PLAYER" && conversation.hub && conversation.player) {
    participants.push(
      {
        id: conversation.hub.owner.id,
        name: displayName(conversation.hub.owner),
        image: conversation.hub.owner.image,
        role: "PARTNER",
        blockedByMe: myBlockedIds.includes(conversation.hub.owner.id),
      },
      {
        id: conversation.player.id,
        name: displayName(conversation.player),
        image: conversation.player.image,
        role: "PLAYER",
        blockedByMe: myBlockedIds.includes(conversation.player.id),
      }
    );
  } else if (conversation.kind === "TRAINER_SESSION" && conversation.trainerSession) {
    participants.push(
      {
        id: conversation.trainerSession.trainer.user.id,
        name: displayName(conversation.trainerSession.trainer.user),
        image: conversation.trainerSession.trainer.user.image,
        role: "PLAYER",
        blockedByMe: myBlockedIds.includes(conversation.trainerSession.trainer.user.id),
      },
      {
        id: conversation.trainerSession.player.id,
        name: displayName(conversation.trainerSession.player),
        image: conversation.trainerSession.player.image,
        role: "PLAYER",
        blockedByMe: myBlockedIds.includes(conversation.trainerSession.player.id),
      }
    );
  } else if (conversation.event) {
    const registrations = await prisma.eventRegistration.findMany({
      where: {
        eventId: conversation.event.id,
        status: "CONFIRMED",
        userId: { not: null },
      },
      orderBy: { confirmedAt: "asc" },
      select: {
        user: { select: { id: true, name: true, playerName: true, image: true } },
      },
    });
    participants.push({
      id: conversation.event.hub.owner.id,
      name: displayName(conversation.event.hub.owner),
      image: conversation.event.hub.owner.image,
      role: "PARTNER",
      blockedByMe: myBlockedIds.includes(conversation.event.hub.owner.id),
    });
    participants.push(
      ...registrations.flatMap(({ user }) =>
        user
          ? [
              {
                id: user.id,
                name: displayName(user),
                image: user.image,
                role: "PLAYER" as const,
                blockedByMe: myBlockedIds.includes(user.id),
              },
            ]
          : []
      )
    );
  }
  const otherId =
    conversation.kind === "HUB_PLAYER"
      ? viewer.role === "PLAYER"
        ? conversation.hub?.ownerId
        : conversation.playerId
      : conversation.kind === "TRAINER_SESSION" && conversation.trainerSession
        ? viewer.id === conversation.trainerSession.playerId
          ? conversation.trainerSession.trainer.userId
          : conversation.trainerSession.playerId
        : null;
  const privateBlock = otherId
    ? await prisma.chatBlock.findFirst({
          where: {
            OR: [
              { blockerId: viewer.actorId, blockedId: otherId },
              { blockerId: otherId, blockedId: viewer.actorId },
            ],
          },
          select: { blockerId: true },
        })
    : null;
  return {
    id: conversationId,
    kind: conversation.kind,
    ...presentation,
    restricted: viewer.chatRestrictedAt != null || !viewer.canSend,
    blocked: Boolean(privateBlock),
    blockedByMe: privateBlock?.blockerId === viewer.actorId,
    context,
    participants,
  };
}

export async function getConversationDetails(
  conversationId: string
): Promise<ConversationDetails | null> {
  const viewer = await messageViewer();
  if (!viewer) return null;
  const access = await accessConversation(conversationId, viewer);
  if (!access) return null;
  const blockedIds = await blockedUserIds(viewer.actorId);
  return conversationDetailsForViewer(access, viewer, blockedIds);
}

async function conversationMessagesForViewer(
  args: { conversationId: string; cursor?: string },
  viewer: MessageViewer,
  access: ConversationAccess,
  blockedIds: string[]
): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId: args.conversationId,
      createdAt: { gte: access.visibleFrom },
      senderId:
        blockedIds.length > 0 ? { notIn: blockedIds } : undefined,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE_SIZE + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      kind: true,
      body: true,
      targetPath: true,
      senderId: true,
      editedAt: true,
      deletedAt: true,
      createdAt: true,
      sender: {
        select: { id: true, name: true, playerName: true, image: true },
      },
    },
  });
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  const page = rows.slice(0, MESSAGE_PAGE_SIZE);
  return {
    messages: page.reverse().map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.deletedAt ? null : row.body,
      targetPath: row.targetPath,
      sender: row.sender
        ? {
            id: row.sender.id,
            name: displayName(row.sender),
            image: row.sender.image,
          }
        : null,
      mine: row.senderId === viewer.actorId,
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[0]?.id ?? null : null,
  };
}

export async function listConversationMessages(args: {
  conversationId: string;
  cursor?: string;
}): Promise<{ messages: MessageView[]; nextCursor: string | null } | null> {
  const viewer = await messageViewer();
  if (!viewer) return null;
  const access = await accessConversation(args.conversationId, viewer);
  if (!access) return null;
  const blockedIds = await blockedUserIds(viewer.actorId);
  return conversationMessagesForViewer(args, viewer, access, blockedIds);
}

export async function loadMessagesWorkspace(conversationId?: string) {
  const viewer = await messageViewer();
  if (!viewer) return null;
  const listed = await loadConversationList(viewer);
  const selectedId =
    conversationId ??
    (listed.conversations.length === 1 ? listed.conversations[0].id : null);
  const access = selectedId
    ? listed.accesses.find((item) => item.conversationId === selectedId) ?? null
    : null;
  if (!access) {
    return {
      viewer,
      conversations: listed.conversations,
      totalUnread: listed.totalUnread,
      conversation: null,
      messages: null,
    };
  }
  const [conversation, messages] = await Promise.all([
    conversationDetailsForViewer(access, viewer, listed.blockedIds),
    conversationMessagesForViewer(
      { conversationId: access.conversationId },
      viewer,
      access,
      listed.blockedIds
    ),
  ]);
  return {
    viewer,
    conversations: listed.conversations,
    totalUnread: listed.totalUnread,
    conversation,
    messages,
  };
}

async function privateConversationBlocked(
  access: ConversationAccess,
  _viewerId: string
): Promise<boolean> {
  const privateIds = access.conversation.kind === "HUB_PLAYER"
    ? [access.conversation.hub?.ownerId, access.conversation.playerId]
    : access.conversation.kind === "TRAINER_SESSION" && access.conversation.trainerSession
      ? [access.conversation.trainerSession.trainer.userId, access.conversation.trainerSession.playerId]
      : null;
  if (!privateIds) return false;
  const [firstId, secondId] = privateIds;
  if (!firstId || !secondId) return true;
  return Boolean(
    await prisma.chatBlock.findFirst({
      where: {
        OR: [
          { blockerId: firstId, blockedId: secondId },
          { blockerId: secondId, blockedId: firstId },
        ],
      },
      select: { blockerId: true },
    })
  );
}

export async function sendConversationMessage(
  conversationId: string,
  input: unknown,
  authenticatedViewer?: MessageViewer
): Promise<{ message?: MessageView; error?: string }> {
  const viewer = authenticatedViewer ?? (await messageViewer());
  if (!viewer) return { error: "Conversation not available." };
  if (viewer.chatRestrictedAt || !viewer.canSend) {
    return { error: "Your account cannot send messages right now." };
  }
  const parsed = SendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your message." };
  }
  const access = await accessConversation(conversationId, viewer);
  if (!access) return { error: "Conversation not available." };
  if (await privateConversationBlocked(access, viewer.actorId)) {
    return { error: "This conversation is blocked." };
  }
  const now = new Date();
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      kind: ChatMessageKind;
      body: string | null;
      targetPath: string | null;
      senderId: string | null;
      editedAt: Date | null;
      deletedAt: Date | null;
      createdAt: Date;
    }>
  >(Prisma.sql`
    WITH message AS (
      INSERT INTO "ChatMessage" (
        "id",
        "conversationId",
        "senderId",
        "kind",
        "body",
        "clientNonce",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${randomUUID()},
        ${conversationId},
        ${viewer.actorId},
        'USER'::"ChatMessageKind",
        ${parsed.data.body},
        ${parsed.data.clientNonce},
        ${now},
        ${now}
      )
      ON CONFLICT ("conversationId", "senderId", "clientNonce")
      DO UPDATE SET "updatedAt" = "ChatMessage"."updatedAt"
      RETURNING
        "id",
        "kind",
        "body",
        "targetPath",
        "senderId",
        "editedAt",
        "deletedAt",
        "createdAt"
    ), conversation_update AS (
      UPDATE "ChatConversation"
      SET
        "lastMessageAt" = (SELECT "createdAt" FROM message),
        "updatedAt" = ${now}
      WHERE "id" = ${conversationId}
    ), read_update AS (
      INSERT INTO "ChatReadState" (
        "conversationId",
        "userId",
        "lastReadAt",
        "createdAt",
        "updatedAt"
      ) VALUES (${conversationId}, ${viewer.actorId}, ${now}, ${now}, ${now})
      ON CONFLICT ("conversationId", "userId")
      DO UPDATE SET
        "lastReadAt" = EXCLUDED."lastReadAt",
        "updatedAt" = EXCLUDED."updatedAt"
    )
    SELECT * FROM message
  `);
  const row = rows[0];
  if (!row) return { error: "Message could not be sent." };
  await recordStaffMessageActivity(
    viewer,
    "MESSAGE_SENT",
    "ChatMessage",
    row.id
  );
  await publishMessageEvent(conversationId, "created");
  return {
    message: {
      id: row.id,
      kind: row.kind,
      body: row.body,
      targetPath: row.targetPath,
      sender: {
        id: viewer.actorId,
        name: displayName(viewer),
        image: viewer.image,
      },
      mine: true,
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

export async function editConversationMessage(
  messageId: string,
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await messageViewer();
  if (!viewer || viewer.chatRestrictedAt || !viewer.canSend) return { ok: false, error: "Not allowed." };
  const parsed = EditMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { conversationId: true, senderId: true, kind: true, deletedAt: true },
  });
  if (
    !message ||
    message.senderId !== viewer.actorId ||
    message.kind !== "USER" ||
    message.deletedAt ||
    !(await accessConversation(message.conversationId, viewer))
  ) {
    return { ok: false, error: "Message not available." };
  }
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: parsed.data.body, editedAt: new Date() },
  });
  await recordStaffMessageActivity(
    viewer,
    "MESSAGE_EDITED",
    "ChatMessage",
    messageId
  );
  await publishMessageEvent(message.conversationId, "updated");
  return { ok: true };
}

export async function deleteConversationMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await messageViewer();
  if (!viewer || !viewer.canSend) return { ok: false, error: "Not allowed." };
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { conversationId: true, senderId: true, kind: true, deletedAt: true },
  });
  if (
    !message ||
    message.senderId !== viewer.actorId ||
    message.kind !== "USER" ||
    message.deletedAt ||
    !(await accessConversation(message.conversationId, viewer))
  ) {
    return { ok: false, error: "Message not available." };
  }
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: null, deletedAt: new Date(), deletedById: viewer.actorId },
  });
  await recordStaffMessageActivity(
    viewer,
    "MESSAGE_DELETED",
    "ChatMessage",
    messageId
  );
  await publishMessageEvent(message.conversationId, "deleted");
  return { ok: true };
}

export async function markConversationRead(
  conversationId: string
): Promise<boolean> {
  const viewer = await messageViewer();
  if (!viewer || !(await accessConversation(conversationId, viewer))) return false;
  await prisma.chatReadState.upsert({
    where: { conversationId_userId: { conversationId, userId: viewer.actorId } },
    create: { conversationId, userId: viewer.actorId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
  return true;
}

export async function setConversationBlock(args: {
  conversationId: string;
  targetUserId: string;
  blocked: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const viewer = await messageViewer();
  if (!viewer || !viewer.canSend || viewer.actorId === args.targetUserId) return { ok: false, error: "Not allowed." };
  const access = await accessConversation(args.conversationId, viewer);
  if (!access) return { ok: false, error: "Conversation not available." };
  const details = await getConversationDetails(args.conversationId);
  if (!details?.participants.some((member) => member.id === args.targetUserId)) {
    return { ok: false, error: "Member not found." };
  }
  if (args.blocked) {
    await prisma.chatBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: viewer.actorId,
          blockedId: args.targetUserId,
        },
      },
      create: { blockerId: viewer.actorId, blockedId: args.targetUserId },
      update: {},
    });
  } else {
    await prisma.chatBlock.deleteMany({
      where: { blockerId: viewer.actorId, blockedId: args.targetUserId },
    });
  }
  await publishMessageEvent(args.conversationId, "updated");
  return { ok: true };
}

export async function reportConversationMessage(
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await messageViewer();
  if (!viewer || !viewer.canSend) return { ok: false, error: "Not allowed." };
  const parsed = ReportMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const message = await prisma.chatMessage.findUnique({
    where: { id: parsed.data.messageId },
    select: { conversationId: true, senderId: true, body: true, kind: true },
  });
  if (
    !message ||
    message.kind !== "USER" ||
    message.senderId === viewer.actorId ||
    !(await accessConversation(message.conversationId, viewer))
  ) {
    return { ok: false, error: "Message not available." };
  }
  await prisma.chatReport.upsert({
    where: {
      messageId_reporterId: {
        messageId: parsed.data.messageId,
        reporterId: viewer.actorId,
      },
    },
    create: {
      messageId: parsed.data.messageId,
      reporterId: viewer.actorId,
      category: parsed.data.category,
      details: parsed.data.details || null,
      evidenceBody: message.body,
    },
    update: {
      category: parsed.data.category,
      details: parsed.data.details || null,
      evidenceBody: message.body,
      status: "OPEN",
      reviewerId: null,
      resolution: null,
      reviewedAt: null,
    },
  });
  return { ok: true };
}

export async function eligibleConversationIds(): Promise<{
  userId: string;
  conversationIds: string[];
} | null> {
  const listed = await listMessageConversations();
  if (!listed) return null;
  return {
    userId: listed.viewer.actorId,
    conversationIds: listed.conversations.map((item) => item.id),
  };
}
