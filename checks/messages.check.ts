// Booking-scoped event discussions and private venue/player conversations.
//
//   npm run check:messages
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const EMAIL_PREFIX = "check-messages-";
const DATE = "2099-10-20";

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
}

async function check() {
  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "Messages Partner",
      email: `${EMAIL_PREFIX}partner@example.test`,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true, email: true, role: true },
  });
  const players = await Promise.all(
    [1, 2, 3].map((index) =>
      prisma.user.create({
        data: {
          name: `Messages Player ${index}`,
          playerName: `Player ${index}`,
          email: `${EMAIL_PREFIX}player-${index}@example.test`,
          role: "PLAYER",
        },
        select: { id: true, email: true, role: true },
      })
    )
  );
  const emptyPartner = await prisma.user.create({
    data: {
      name: "Messages Empty Partner",
      email: `${EMAIL_PREFIX}empty-partner@example.test`,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true, role: true, partnerStatus: true },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Messages Hub",
      coverPhotos: [],
      games: ["pickleball"],
      courts: { create: { name: "Message Court", hourlyRate: 500 } },
    },
    select: { id: true, courts: { select: { id: true } } },
  });
  const event = await prisma.event.create({
    data: {
      publicId: `messages-event-${partner.id}`,
      hubId: hub.id,
      title: "Messages Open Play",
      sport: "pickleball",
      date: DATE,
      startHour: 18,
      endHour: 20,
      startsAt: manilaInstant(DATE, 18),
      endsAt: manilaInstant(DATE, 20),
      capacity: 12,
      registrationFee: 0,
      status: "PUBLISHED",
      publishedAt: new Date(),
      registrations: {
        create: players.slice(0, 2).map((player) => ({
          userId: player.id,
          status: "CONFIRMED" as const,
          confirmedAt: new Date(),
        })),
      },
    },
    select: { id: true },
  });
  for (let index = 0; index < 2; index++) {
    await prisma.booking.create({
      data: {
        courtId: hub.courts[0].id,
        hubId: hub.id,
        userId: players[index].id,
        date: DATE,
        startHour: 10 + index,
        endHour: 11 + index,
        hours: 1,
        startsAt: manilaInstant(DATE, 10 + index),
        endsAt: manilaInstant(DATE, 11 + index),
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });
  }

  stubRequestContext(players[0]);
  const messages = await import("@/lib/messages");
  ok(
    "an active partner sees Messages before receiving a booking",
    await messages.hasMessageAccess({
      userId: emptyPartner.id,
      role: emptyPartner.role,
      partnerStatus: emptyPartner.partnerStatus,
    })
  );
  ok(
    "a player sees Messages before making a booking",
    await messages.hasMessageAccess({
      userId: players[2].id,
      role: players[2].role,
      partnerStatus: null,
    })
  );
  ok(
    "an inactive partner cannot open the Messages workspace",
    !(await messages.hasMessageAccess({
      userId: emptyPartner.id,
      role: emptyPartner.role,
      partnerStatus: "DRAFT",
    }))
  );
  const listed = await messages.listMessageConversations();
  ok(
    "a confirmed player receives one event room and one private venue room",
    listed?.conversations.length === 2 &&
      listed.conversations.some((item) => item.kind === "EVENT") &&
      listed.conversations.some((item) => item.kind === "HUB_PLAYER")
  );

  const eventConversation = listed?.conversations.find(
    (item) => item.kind === "EVENT"
  );
  const privateConversation = listed?.conversations.find(
    (item) => item.kind === "HUB_PLAYER"
  );
  if (!eventConversation || !privateConversation) {
    throw new Error("Expected message conversations were not created");
  }
  const details = await messages.getConversationDetails(eventConversation.id);
  ok(
    "the event room contains the partner and confirmed players only",
    details?.participants.length === 3 &&
      details.participants.some((member) => member.id === partner.id) &&
      !details.participants.some((member) => member.id === players[2].id)
  );
  ok(
    "the event room exposes authoritative event context",
    details?.context.eyebrow === "Event" &&
      details.context.title === "Messages Open Play" &&
      details.context.href.startsWith("/events/")
  );

  const privateDetails = await messages.getConversationDetails(
    privateConversation.id
  );
  ok(
    "the private room exposes its qualifying booking context",
    privateDetails?.context.eyebrow === "Court booking" &&
      privateDetails.context.title === "Message Court" &&
      privateDetails.context.href.startsWith("/dashboard/bookings")
  );

  const sent = await messages.sendConversationMessage(eventConversation.id, {
    body: "See everyone on the court!",
    clientNonce: "messageschecknonce1",
  });
  const repeated = await messages.sendConversationMessage(eventConversation.id, {
    body: "See everyone on the court!",
    clientNonce: "messageschecknonce1",
  });
  ok(
    "a client nonce makes message sending idempotent",
    sent.message?.id != null && sent.message.id === repeated.message?.id
  );

  const otherPrivate = await prisma.chatConversation.upsert({
    where: { hubId_playerId: { hubId: hub.id, playerId: players[1].id } },
    create: { kind: "HUB_PLAYER", hubId: hub.id, playerId: players[1].id },
    update: {},
    select: { id: true },
  });
  ok(
    "the player cannot open another player's venue conversation",
    (await messages.listConversationMessages({
      conversationId: otherPrivate.id,
    })) === null
  );

  await prisma.eventRegistration.updateMany({
    where: { eventId: event.id, userId: players[0].id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  const afterCancellation = await messages.listMessageConversations();
  ok(
    "event cancellation immediately removes that player's event room",
    afterCancellation?.conversations.every((item) => item.kind !== "EVENT") === true
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
