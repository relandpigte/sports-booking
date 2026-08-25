import "server-only";

import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { publishMessageEvent } from "@/lib/messages-realtime";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

function displayName(user: {
  playerName: string | null;
  name: string | null;
}): string {
  return user.playerName ?? user.name ?? "Member";
}

async function ensureHubPlayerConversation(
  tx: Prisma.TransactionClient,
  hubId: string,
  playerId: string
) {
  return tx.chatConversation.upsert({
    where: { hubId_playerId: { hubId, playerId } },
    create: { kind: "HUB_PLAYER", hubId, playerId },
    update: {},
    select: { id: true },
  });
}

async function ensureEventConversation(
  tx: Prisma.TransactionClient,
  eventId: string
) {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: { hubId: true },
  });
  if (!event) return null;
  return tx.chatConversation.upsert({
    where: { eventId },
    create: { kind: "EVENT", eventId, hubId: event.hubId },
    update: {},
    select: { id: true },
  });
}

async function createSystemMessage(
  tx: Prisma.TransactionClient,
  args: {
    conversationId: string;
    systemKey: string;
    systemType: string;
    body: string;
    targetPath: string;
  }
) {
  const message = await tx.chatMessage.upsert({
    where: { systemKey: args.systemKey },
    create: {
      conversationId: args.conversationId,
      kind: "SYSTEM",
      systemKey: args.systemKey,
      systemType: args.systemType,
      body: args.body.slice(0, 2000),
      targetPath: args.targetPath.slice(0, 500),
    },
    update: {},
    select: { createdAt: true },
  });
  await tx.chatConversation.update({
    where: { id: args.conversationId },
    data: { lastMessageAt: message.createdAt },
  });
}

async function recordBookingSystemMessageUnsafe(
  bookingId: string,
  type: "CONFIRMED" | "RESCHEDULED" | "CANCELLED"
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      hubId: true,
      userId: true,
      date: true,
      startHour: true,
      endHour: true,
      rescheduleCount: true,
      cancelledAt: true,
      court: { select: { name: true } },
    },
  });
  if (!booking || !booking.userId) return;
  const playerId = booking.userId;
  const schedule = `${formatManilaDateLong(booking.date)}, ${formatSlotRange(
    booking.startHour,
    booking.endHour
  )} · ${booking.court.name}`;
  const systemKey =
    type === "CONFIRMED"
      ? `booking-confirmed:${booking.id}`
      : type === "RESCHEDULED"
        ? `booking-rescheduled:${booking.id}:${booking.rescheduleCount}`
        : `booking-cancelled:${booking.id}:${booking.cancelledAt?.getTime() ?? 0}`;
  const body =
    type === "CONFIRMED"
      ? `Booking confirmed for ${schedule}.`
      : type === "RESCHEDULED"
        ? `Booking moved to ${schedule}.`
        : `The booking for ${schedule} was cancelled.`;
  const conversationId = await prisma.$transaction(async (tx) => {
    const conversation = await ensureHubPlayerConversation(
      tx,
      booking.hubId,
      playerId
    );
    await createSystemMessage(tx, {
      conversationId: conversation.id,
      systemKey,
      systemType: `BOOKING_${type}`,
      body,
      targetPath: `/dashboard/bookings?q=${encodeURIComponent(booking.id)}`,
    });
    return conversation.id;
  });
  await publishMessageEvent(conversationId, "created");
}

export async function recordBookingSystemMessage(
  bookingId: string,
  type: "CONFIRMED" | "RESCHEDULED" | "CANCELLED"
): Promise<void> {
  try {
    await recordBookingSystemMessageUnsafe(bookingId, type);
  } catch (error) {
    console.error(
      "Booking message event failed:",
      error instanceof Error ? error.message : "Unknown message error"
    );
  }
}

async function recordEventRegistrationSystemMessageUnsafe(
  registrationId: string,
  type: "CONFIRMED" | "CANCELLED"
): Promise<void> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      confirmedAt: true,
      cancelledAt: true,
      user: { select: { name: true, playerName: true } },
      event: { select: { id: true, publicId: true, title: true } },
    },
  });
  if (!registration) return;
  const name = displayName(registration.user);
  const timestamp =
    type === "CONFIRMED"
      ? registration.confirmedAt?.getTime() ?? 0
      : registration.cancelledAt?.getTime() ?? 0;
  const conversationId = await prisma.$transaction(async (tx) => {
    const conversation = await ensureEventConversation(tx, registration.event.id);
    if (!conversation) return null;
    await createSystemMessage(tx, {
      conversationId: conversation.id,
      systemKey: `event-registration-${type.toLowerCase()}:${registration.id}:${timestamp}`,
      systemType: `EVENT_REGISTRATION_${type}`,
      body:
        type === "CONFIRMED"
          ? `${name} joined ${registration.event.title}.`
          : `${name} is no longer registered for ${registration.event.title}.`,
      targetPath: `/events/${registration.event.publicId}`,
    });
    return conversation.id;
  });
  if (conversationId) await publishMessageEvent(conversationId, "created");
}

export async function recordEventRegistrationSystemMessage(
  registrationId: string,
  type: "CONFIRMED" | "CANCELLED"
): Promise<void> {
  try {
    await recordEventRegistrationSystemMessageUnsafe(registrationId, type);
  } catch (error) {
    console.error(
      "Event registration message failed:",
      error instanceof Error ? error.message : "Unknown message error"
    );
  }
}

async function recordEventSystemMessageUnsafe(
  eventId: string,
  type: "UPDATED" | "CANCELLED"
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      publicId: true,
      title: true,
      date: true,
      startHour: true,
      endHour: true,
      updatedAt: true,
      cancelledAt: true,
    },
  });
  if (!event) return;
  const schedule = `${formatManilaDateLong(event.date)}, ${formatSlotRange(
    event.startHour,
    event.endHour
  )}`;
  const timestamp =
    type === "CANCELLED"
      ? event.cancelledAt?.getTime() ?? event.updatedAt.getTime()
      : event.updatedAt.getTime();
  const conversationId = await prisma.$transaction(async (tx) => {
    const conversation = await ensureEventConversation(tx, event.id);
    if (!conversation) return null;
    await createSystemMessage(tx, {
      conversationId: conversation.id,
      systemKey: `event-${type.toLowerCase()}:${event.id}:${timestamp}`,
      systemType: `EVENT_${type}`,
      body:
        type === "CANCELLED"
          ? `${event.title} was cancelled.`
          : `${event.title} was updated. Current schedule: ${schedule}.`,
      targetPath: `/events/${event.publicId}`,
    });
    return conversation.id;
  });
  if (conversationId) await publishMessageEvent(conversationId, "created");
}

export async function recordEventSystemMessage(
  eventId: string,
  type: "UPDATED" | "CANCELLED"
): Promise<void> {
  try {
    await recordEventSystemMessageUnsafe(eventId, type);
  } catch (error) {
    console.error(
      "Event message event failed:",
      error instanceof Error ? error.message : "Unknown message error"
    );
  }
}
