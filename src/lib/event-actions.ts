"use server";

import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import {
  BOOKING_HOLD_MINUTES,
  bookingServiceFeeFor,
  grossFor,
  manualBookingServiceFeeFor,
  manualGrossFor,
} from "@/lib/constants";
import { getViewer, requireActivePartner } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getEventCourtAvailability } from "@/lib/events";
import { getPartnerPaymentSetup } from "@/lib/manual-payments";
import {
  chargeBookingPayment,
  recoverPaidEventRegistration,
  refundBookingPayment,
  settleBookingPayment,
} from "@/lib/booking-payments";
import { isServiceFeeOverdue } from "@/lib/service-fees";
import {
  formatManilaDateLong,
  formatSlotRange,
  isValidDateString,
  manilaInstant,
  manilaToday,
} from "@/lib/time";
import { firstErrors } from "@/lib/zod-errors";
import { recordImpersonatedAction } from "@/lib/impersonation";
import { notifyPartnerOfBooking } from "@/lib/booking-notifications";
import { consumeRateLimit } from "@/lib/rate-limit";

const optionalText = z
  .string()
  .trim()
  .max(3_000, { error: "Keep the description under 3,000 characters." })
  .optional()
  .transform((value) => (value ? value : undefined));

const EventFormSchema = z
  .object({
    eventId: z.string().trim().optional(),
    hubId: z.string().min(1, { error: "Choose a hub." }),
    title: z
      .string()
      .trim()
      .min(3, { error: "Event title is required." })
      .max(120, { error: "Keep the title under 120 characters." }),
    description: optionalText,
    sport: z.string().trim().min(1, { error: "Choose a sport." }),
    date: z.string().refine(isValidDateString, { error: "Choose a valid date." }),
    startHour: z.coerce.number().int().min(0).max(23),
    endHour: z.coerce.number().int().min(1).max(24),
    capacity: z.coerce
      .number()
      .int()
      .min(2, { error: "Allow at least 2 players." })
      .max(500, { error: "Capacity cannot exceed 500 players." }),
    registrationFee: z.coerce
      .number()
      .min(0, { error: "Registration fee cannot be negative." })
      .max(1_000_000, { error: "Registration fee is too high." }),
    courtIds: z
      .array(z.string().min(1))
      .min(1, { error: "Choose at least one court." })
      .max(40, { error: "Too many courts selected." }),
    intent: z.enum(["draft", "publish"]),
  })
  .refine((value) => value.endHour > value.startHour, {
    error: "End time must be after the start time.",
    path: ["endHour"],
  })
  .refine((value) => value.endHour - value.startHour <= 16, {
    error: "An event can run for at most 16 hours.",
    path: ["endHour"],
  });

const CancelEventSchema = z.object({
  eventId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, { error: "Give players a cancellation reason." })
    .max(1_000),
  refund: z.enum(["full", "none"]).catch("full"),
});

const DeleteCancelledEventSchema = z.object({
  eventId: z.string().min(1),
});

const ManageRegistrationSchema = z.object({
  registrationId: z.string().min(1),
  reason: z.string().trim().max(1_000).optional(),
  refund: z.enum(["full", "none"]).catch("full"),
});

const OrganizerGuestSchema = z.object({
  guestId: z.string().min(1),
});

const GuestNamesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, { error: "Enter a name for every guest spot." })
      .max(80, { error: "Keep each guest name under 80 characters." })
  )
  .max(50, { error: "Add at most 50 guest spots at once." });

export type EventFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

function revalidateEventSurfaces(publicId: string, hubId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${publicId}`);
  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${publicId}`);
  revalidatePath("/dashboard");
  revalidatePath("/hubs");
  revalidatePath(`/hubs/${hubId}`);
}

function eventPublicId(): string {
  return crypto.randomBytes(12).toString("base64url");
}

function sameIds(left: string[], right: string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function guestNamesFrom(formData: FormData):
  | { ok: true; names: string[] }
  | { ok: false; message: string } {
  const parsed = GuestNamesSchema.safeParse(
    formData.getAll("guestName").map(String)
  );
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Check the names entered for the guest spots.",
    };
  }
  return { ok: true, names: parsed.data };
}

async function expireEventCapacityHolds(
  tx: Prisma.TransactionClient,
  eventId: string,
  now: Date
) {
  await Promise.all([
    tx.eventRegistration.updateMany({
      where: {
        eventId,
        status: "PENDING",
        holdExpiresAt: { lte: now },
      },
      data: { status: "EXPIRED", holdExpiresAt: null },
    }),
    tx.eventGuestSlot.updateMany({
      where: {
        registration: { eventId },
        status: "PENDING",
        holdExpiresAt: { lte: now },
      },
      data: { status: "EXPIRED", holdExpiresAt: null },
    }),
  ]);
}

async function occupiedEventSpots(
  tx: Prisma.TransactionClient,
  eventId: string,
  now: Date
): Promise<number> {
  const [leadPlayers, guests, organizerGuests] = await Promise.all([
    tx.eventRegistration.count({
      where: {
        eventId,
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", holdExpiresAt: { gt: now } },
          {
            status: "PENDING",
            payment: { collectionMode: "MANUAL", manualSubmittedAt: { not: null } },
          },
        ],
      },
    }),
    tx.eventGuestSlot.count({
      where: {
        registration: { eventId },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", holdExpiresAt: { gt: now } },
          {
            status: "PENDING",
            payment: { collectionMode: "MANUAL", manualSubmittedAt: { not: null } },
          },
        ],
      },
    }),
    tx.eventOrganizerGuest.count({
      where: { eventId, status: "CONFIRMED" },
    }),
  ]);
  return leadPlayers + guests + organizerGuests;
}

export async function saveEventAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const partner = await requireActivePartner();
  const parsed = EventFormSchema.safeParse({
    eventId: String(formData.get("eventId") ?? "") || undefined,
    hubId: String(formData.get("hubId") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    sport: String(formData.get("sport") ?? ""),
    date: String(formData.get("date") ?? ""),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    capacity: formData.get("capacity"),
    registrationFee: formData.get("registrationFee"),
    courtIds: formData.getAll("courtIds").map(String),
    intent: String(formData.get("intent") ?? "draft"),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const values = parsed.data;
  if (values.date < manilaToday()) {
    return { errors: { date: "That date has already passed." } };
  }

  const hub = await prisma.hub.findFirst({
    where: { id: values.hubId, ownerId: partner.id },
    select: {
      id: true,
      games: true,
      courts: { select: { id: true } },
      owner: {
        select: {
          partnerPaymentMode: true,
          partnerGateway: { select: { disconnectedAt: true } },
          manualPaymentMethods: {
            where: { active: true },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!hub) return { errors: { hubId: "Hub not found." } };
  if (!hub.games.includes(values.sport)) {
    return { errors: { sport: "That sport is not offered by this hub." } };
  }

  const uniqueCourtIds = [...new Set(values.courtIds)];
  const ownedCourtIds = new Set(hub.courts.map((court) => court.id));
  if (uniqueCourtIds.some((courtId) => !ownedCourtIds.has(courtId))) {
    return { errors: { courtIds: "One of those courts belongs to another hub." } };
  }
  const existing = values.eventId
    ? await prisma.event.findFirst({
        where: { id: values.eventId, hub: { ownerId: partner.id } },
        select: {
          id: true,
          publicId: true,
          hubId: true,
          status: true,
          date: true,
          startHour: true,
          endHour: true,
          registrationFee: true,
          capacity: true,
          courts: { select: { courtId: true } },
          registrations: {
            where: {
              OR: [
                { status: "CONFIRMED" },
                { status: "PENDING", holdExpiresAt: { gt: new Date() } },
                { status: "PENDING", payment: { manualSubmittedAt: { not: null } } },
              ],
            },
            select: {
              id: true,
              guests: {
                where: {
                  OR: [
                    { status: "CONFIRMED" },
                    { status: "PENDING", holdExpiresAt: { gt: new Date() } },
                    { status: "PENDING", payment: { manualSubmittedAt: { not: null } } },
                  ],
                },
                select: { id: true },
              },
            },
          },
        },
      })
    : null;
  if (values.eventId && !existing) return { message: "Event not found." };
  if (existing?.status === "CANCELLED") {
    return { message: "A cancelled event cannot be edited." };
  }

  const occupied =
    existing?.registrations.reduce(
      (total, registration) => total + 1 + registration.guests.length,
      0
    ) ?? 0;
  if (values.capacity < occupied) {
    return {
      errors: {
        capacity: `Capacity cannot be lower than the ${occupied} reserved spots.`,
      },
    };
  }
  if (
    existing &&
    occupied > 0 &&
    (existing.date !== values.date ||
      existing.startHour !== values.startHour ||
      existing.endHour !== values.endHour ||
      Number(existing.registrationFee) !== values.registrationFee ||
      !sameIds(
        existing.courts.map((court) => court.courtId),
        uniqueCourtIds
      ))
  ) {
    return {
      message:
        "The schedule, courts and fee are locked after players reserve spots. You can still update the title, description and capacity.",
    };
  }

  const willPublish =
    values.intent === "publish" || existing?.status === "PUBLISHED";
  if (
    willPublish &&
    values.registrationFee > 0 &&
    (hub.owner.partnerPaymentMode === "MANUAL"
      ? hub.owner.manualPaymentMethods.length === 0
      : hub.owner.partnerGateway?.disconnectedAt !== null)
  ) {
    return {
      errors: {
        registrationFee:
          "Set up the selected payment mode before publishing a paid event. Free events can be published now.",
      },
    };
  }
  if (
    willPublish &&
    values.registrationFee > 0 &&
    (await isServiceFeeOverdue(partner.id))
  ) {
    return {
      errors: {
        registrationFee:
          "Settle the overdue Bunal service-fee balance before publishing a paid event.",
      },
    };
  }
  if (willPublish) {
    const availability = await getEventCourtAvailability({
      ownerId: partner.id,
      hubId: values.hubId,
      date: values.date,
      startHour: values.startHour,
      endHour: values.endHour,
      excludeEventId: existing?.id,
    });
    const unavailable = availability?.filter(
      (court) => uniqueCourtIds.includes(court.id) && !court.available
    );
    if (!availability || unavailable?.length) {
      return {
        errors: {
          courtIds:
            unavailable?.map((court) => `${court.name}: ${court.reason}`).join(" ") ??
            "Court availability could not be checked.",
        },
      };
    }
  }

  const publicId = existing?.publicId ?? eventPublicId();
  let eventId = existing?.id;
  try {
    await prisma.$transaction(async (tx) => {
      const data = {
        hubId: values.hubId,
        title: values.title,
        description: values.description ?? null,
        sport: values.sport,
        date: values.date,
        startHour: values.startHour,
        endHour: values.endHour,
        startsAt: manilaInstant(values.date, values.startHour),
        endsAt: manilaInstant(values.date, values.endHour),
        capacity: values.capacity,
        registrationFee: new Prisma.Decimal(
          Math.round(values.registrationFee * 100) / 100
        ),
        status: willPublish ? ("PUBLISHED" as const) : ("DRAFT" as const),
        publishedAt: willPublish ? new Date() : null,
      };

      if (existing) {
        await tx.event.update({ where: { id: existing.id }, data });
        eventId = existing.id;
      } else {
        const created = await tx.event.create({
          data: { ...data, publicId },
          select: { id: true },
        });
        eventId = created.id;
      }

      await tx.eventCourt.deleteMany({ where: { eventId: eventId! } });
      await tx.eventCourt.createMany({
        data: uniqueCourtIds.map((courtId) => ({ eventId: eventId!, courtId })),
      });

      await tx.bookingSlot.deleteMany({ where: { eventId: eventId! } });
      if (willPublish) {
        const hours = Array.from(
          { length: values.endHour - values.startHour },
          (_, index) => values.startHour + index
        );
        await tx.bookingSlot.createMany({
          data: uniqueCourtIds.flatMap((courtId) =>
            hours.map((hour) => ({
              eventId: eventId!,
              courtId,
              date: values.date,
              hour,
              holdExpiresAt: null,
            }))
          ),
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        message:
          "A court became unavailable while you were saving. Refresh the availability and try again.",
      };
    }
    throw error;
  }

  revalidateEventSurfaces(publicId, values.hubId);
  await recordImpersonatedAction({
    action: existing ? "EVENT_UPDATED" : "EVENT_CREATED",
    targetType: "Event",
    targetId: eventId,
    metadata: { published: willPublish },
  });
  redirect(`/dashboard/events/${publicId}`);
}

export async function registerForEventAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in with a player account to register." };
  if (viewer.role !== "PLAYER") {
    return { message: "Only player accounts can register for events." };
  }
  if (!(await consumeRateLimit({
    namespace: "event-registration",
    subject: viewer.id,
    limit: 20,
    windowSeconds: 10 * 60,
  }))) {
    return { message: "Too many registration attempts. Wait a few minutes and try again." };
  }

  const publicId = String(formData.get("publicId") ?? "");
  if (!publicId) return { message: "Event not found." };
  const guests = guestNamesFrom(formData);
  if (!guests.ok) return { message: guests.message };
  const requestedSpots = 1 + guests.names.length;

  const event = await prisma.event.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      hubId: true,
      title: true,
      date: true,
      startHour: true,
      endHour: true,
      status: true,
      startsAt: true,
      capacity: true,
      registrationFee: true,
      hub: {
        select: {
          name: true,
          ownerId: true,
          owner: {
            select: {
              email: true,
              name: true,
              playerName: true,
              partnerStatus: true,
            },
          },
        },
      },
    },
  });
  if (
    !event ||
    event.status !== "PUBLISHED" ||
    event.hub.owner.partnerStatus !== "ACTIVE"
  ) {
    return { message: "This event is not open for registration." };
  }
  if (event.startsAt <= new Date()) {
    return { message: "Registration has closed for this event." };
  }

  const paidRecovery = await recoverPaidEventRegistration({
    eventId: event.id,
    userId: viewer.id,
  });
  if (paidRecovery.status === "confirmed") {
    revalidateEventSurfaces(event.publicId, event.hubId);
    return { success: "Your paid registration is now confirmed." };
  }
  if (paidRecovery.status === "full") {
    return {
      message:
        "Your payment was received, but the event is now full. Contact support so your payment can be resolved.",
    };
  }

  const fee = Number(event.registrationFee);
  const paymentSetup =
    fee > 0 ? await getPartnerPaymentSetup(event.hub.ownerId) : null;
  const manualPayment = paymentSetup?.mode === "MANUAL";
  const overdue =
    fee > 0 ? await isServiceFeeOverdue(event.hub.ownerId) : false;
  if (
    fee > 0 &&
    (!paymentSetup ||
      (manualPayment
        ? !paymentSetup.manualReady
        : !paymentSetup.automaticReady))
  ) {
    return { message: "The organizer's payment account is not available." };
  }
  if (overdue) {
    return {
      message:
        "Registration is temporarily unavailable while the organizer updates billing.",
    };
  }

  const now = new Date();
  const holdExpiresAt = new Date(
    now.getTime() + BOOKING_HOLD_MINUTES * 60_000
  );
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`
    );

    await expireEventCapacityHolds(tx, event.id, now);

    const existing = await tx.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
      select: {
        id: true,
        status: true,
        holdExpiresAt: true,
        bookingPaymentId: true,
        payment: {
          select: {
            status: true,
            chargeStartedAt: true,
            manualSubmittedAt: true,
          },
        },
      },
    });
    if (existing?.status === "CONFIRMED") {
      return { kind: "confirmed" as const, paymentId: null };
    }
    if (
      existing?.status === "PENDING" &&
      existing.holdExpiresAt != null &&
      existing.holdExpiresAt > now &&
      existing.bookingPaymentId
    ) {
      return {
        kind: "payment" as const,
        paymentId: existing.bookingPaymentId,
      };
    }
    if (
      existing?.bookingPaymentId &&
      existing.payment?.status === "PENDING" &&
      (existing.payment.chargeStartedAt != null ||
        existing.payment.manualSubmittedAt != null)
    ) {
      return {
        kind: "payment" as const,
        paymentId: existing.bookingPaymentId,
      };
    }
    if (
      existing?.bookingPaymentId &&
      existing.payment?.status === "PENDING"
    ) {
      await tx.bookingPayment.updateMany({
        where: {
          id: existing.bookingPaymentId,
          status: "PENDING",
          chargeStartedAt: null,
          manualSubmittedAt: null,
        },
        data: {
          status: "FAILED",
          failureCode: "registration_replaced",
          failureMessage:
            "The registration hold expired before checkout started.",
        },
      });
    }
    const occupied = await occupiedEventSpots(tx, event.id, now);
    if (existing?.payment?.status === "SUCCEEDED") {
      return { kind: "paid-closed" as const, paymentId: null };
    }

    const available = Math.max(0, event.capacity - occupied);
    if (requestedSpots > available) {
      if (requestedSpots > 1 || available > 0) {
        return {
          kind: "insufficient" as const,
          paymentId: null,
          available,
        };
      }
      await tx.eventRegistration.upsert({
        where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
        create: {
          eventId: event.id,
          userId: viewer.id,
          status: "WAITLISTED",
        },
        update: {
          status: "WAITLISTED",
          holdExpiresAt: null,
          bookingPaymentId: null,
          cancelledAt: null,
          cancelReason: null,
        },
      });
      return { kind: "waitlist" as const, paymentId: null };
    }

    if (fee <= 0) {
      const registration = await tx.eventRegistration.upsert({
        where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
        create: {
          eventId: event.id,
          userId: viewer.id,
          status: "CONFIRMED",
          confirmedAt: now,
        },
        update: {
          status: "CONFIRMED",
          holdExpiresAt: null,
          bookingPaymentId: null,
          confirmedAt: now,
          cancelledAt: null,
          cancelReason: null,
        },
        select: { id: true },
      });
      if (guests.names.length > 0) {
        await tx.eventGuestSlot.createMany({
          data: guests.names.map((name) => ({
            eventRegistrationId: registration.id,
            name,
            status: "CONFIRMED" as const,
            confirmedAt: now,
          })),
        });
      }
      return { kind: "confirmed" as const, paymentId: null };
    }

    const venueAmount = fee * requestedSpots;
    const payment = await tx.bookingPayment.create({
      data: {
        partnerId: event.hub.ownerId,
        gatewayId: manualPayment ? null : paymentSetup!.gateway!.id,
        userId: viewer.id,
        hubId: event.hubId,
        amount: new Prisma.Decimal(
          manualPayment ? manualGrossFor(venueAmount) : grossFor(venueAmount)
        ),
        venueAmount: new Prisma.Decimal(venueAmount),
        platformFee: new Prisma.Decimal(
          manualPayment
            ? manualBookingServiceFeeFor(venueAmount)
            : bookingServiceFeeFor(venueAmount)
        ),
        processingFee: new Prisma.Decimal(0),
        method: manualPayment ? "MANUAL" : "QRPH",
        collectionMode: manualPayment ? "MANUAL" : "AUTOMATIC",
        status: "PENDING",
        expiresAt: holdExpiresAt,
        provider: manualPayment
          ? "manual"
          : paymentSetup!.gateway!.provider,
      },
      select: { id: true },
    });
    const registration = await tx.eventRegistration.upsert({
      where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
      create: {
        eventId: event.id,
        userId: viewer.id,
        status: "PENDING",
        holdExpiresAt,
        bookingPaymentId: payment.id,
      },
      update: {
        status: "PENDING",
        holdExpiresAt,
        bookingPaymentId: payment.id,
        confirmedAt: null,
        cancelledAt: null,
        cancelReason: null,
      },
      select: { id: true },
    });
    if (guests.names.length > 0) {
      await tx.eventGuestSlot.createMany({
        data: guests.names.map((name) => ({
          eventRegistrationId: registration.id,
          bookingPaymentId: payment.id,
          name,
          status: "PENDING" as const,
          holdExpiresAt,
        })),
      });
    }
    return { kind: "payment" as const, paymentId: payment.id };
  });

  revalidateEventSurfaces(event.publicId, event.hubId);
  if (
    outcome.kind === "payment" ||
    outcome.kind === "confirmed" ||
    outcome.kind === "waitlist"
  ) {
    await notifyPartnerOfBooking({
      to: event.hub.owner.email,
      partnerName:
        event.hub.owner.playerName ?? event.hub.owner.name ?? "Event organizer",
      playerName: viewer.playerName ?? viewer.name ?? "A player",
      kind: "EVENT",
      venueName: event.hub.name,
      bookingTitle: event.title,
      schedule: `${formatManilaDateLong(event.date)} · ${formatSlotRange(
        event.startHour,
        event.endHour
      )}`,
      status:
        outcome.kind === "waitlist"
          ? "Waitlisted"
          : outcome.kind === "confirmed"
            ? "Confirmed"
            : manualPayment
              ? "Pending manual payment"
              : "Pending automatic payment",
      spots: requestedSpots,
      actionPath: `/dashboard/events/${event.publicId}`,
      idempotencyKey: `partner-event-booking-${
        outcome.kind === "payment"
          ? outcome.paymentId
          : `${event.id}-${viewer.id}-${outcome.kind}`
      }`,
    });
  }
  if (outcome.kind === "payment") {
    // Create the QR Ph checkout now so the next screen can display it without
    // asking the player to press a second payment button.
    if (!manualPayment) {
      await chargeBookingPayment({
        paymentId: outcome.paymentId,
        userId: viewer.id,
      });
    }
    redirect(`/events/${event.publicId}/pay/${outcome.paymentId}`);
  }
  if (outcome.kind === "paid-closed") {
    return {
      message:
        "Your payment was received, but this registration could not be restored automatically. Contact support so your payment can be resolved.",
    };
  }
  if (outcome.kind === "insufficient") {
    return {
      message:
        outcome.available === 0
          ? "This event no longer has enough spots for your group."
          : `Only ${outcome.available} spot${outcome.available === 1 ? " is" : "s are"} available. Reduce your group and try again.`,
    };
  }
  return outcome.kind === "waitlist"
    ? { success: "You're on the free waitlist. Check back when a spot opens." }
    : { success: "You're registered for this event." };
}

export async function addEventGuestSlotsAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Sign in with the confirmed player account." };
  }
  if (!(await consumeRateLimit({
    namespace: "event-guest-slots",
    subject: viewer.id,
    limit: 20,
    windowSeconds: 10 * 60,
  }))) {
    return { message: "Too many guest-slot attempts. Wait a few minutes and try again." };
  }

  const publicId = String(formData.get("publicId") ?? "");
  const guests = guestNamesFrom(formData);
  if (!publicId) return { message: "Event not found." };
  if (!guests.ok) return { message: guests.message };
  if (guests.names.length === 0) {
    return { message: "Add at least one guest name." };
  }

  const event = await prisma.event.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      hubId: true,
      status: true,
      startsAt: true,
      capacity: true,
      registrationFee: true,
      hub: {
        select: { ownerId: true, owner: { select: { partnerStatus: true } } },
      },
    },
  });
  if (
    !event ||
    event.status !== "PUBLISHED" ||
    event.startsAt <= new Date() ||
    event.hub.owner.partnerStatus !== "ACTIVE"
  ) {
    return { message: "Registration has closed for this event." };
  }

  const unsettledPayment = await prisma.bookingPayment.findFirst({
    where: {
      userId: viewer.id,
      status: "SUCCEEDED",
      eventGuestSlots: {
        some: {
          status: { in: ["PENDING", "EXPIRED"] },
          registration: { eventId: event.id, userId: viewer.id },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (unsettledPayment) {
    await settleBookingPayment(unsettledPayment.id);
  }

  const fee = Number(event.registrationFee);
  const paymentSetup =
    fee > 0 ? await getPartnerPaymentSetup(event.hub.ownerId) : null;
  const manualPayment = paymentSetup?.mode === "MANUAL";
  const overdue =
    fee > 0 ? await isServiceFeeOverdue(event.hub.ownerId) : false;
  if (
    fee > 0 &&
    (!paymentSetup ||
      (manualPayment
        ? !paymentSetup.manualReady
        : !paymentSetup.automaticReady))
  ) {
    return { message: "The organizer's payment account is not available." };
  }
  if (overdue) {
    return {
      message:
        "Registration is temporarily unavailable while the organizer updates billing.",
    };
  }

  const now = new Date();
  const holdExpiresAt = new Date(
    now.getTime() + BOOKING_HOLD_MINUTES * 60_000
  );
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`
    );
    await expireEventCapacityHolds(tx, event.id, now);

    const registration = await tx.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
      select: {
        id: true,
        status: true,
        guests: {
          where: {
            status: { in: ["PENDING", "EXPIRED"] },
            bookingPaymentId: { not: null },
            payment: { status: "PENDING" },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            bookingPaymentId: true,
            status: true,
            holdExpiresAt: true,
            payment: {
              select: {
                status: true,
                chargeStartedAt: true,
                manualSubmittedAt: true,
              },
            },
          },
        },
      },
    });
    if (!registration || registration.status !== "CONFIRMED") {
      return { kind: "not-confirmed" as const, paymentId: null };
    }

    const pendingGuest = registration.guests[0];
    if (
      pendingGuest?.bookingPaymentId &&
      pendingGuest.payment?.status === "PENDING" &&
      ((pendingGuest.status === "PENDING" &&
        pendingGuest.holdExpiresAt != null &&
        pendingGuest.holdExpiresAt > now) ||
        pendingGuest.payment.chargeStartedAt != null ||
        pendingGuest.payment.manualSubmittedAt != null)
    ) {
      return {
        kind: "payment" as const,
        paymentId: pendingGuest.bookingPaymentId,
      };
    }
    if (
      pendingGuest?.bookingPaymentId &&
      pendingGuest.payment?.status === "PENDING"
    ) {
      await tx.bookingPayment.updateMany({
        where: {
          id: pendingGuest.bookingPaymentId,
          status: "PENDING",
          chargeStartedAt: null,
          manualSubmittedAt: null,
        },
        data: {
          status: "FAILED",
          failureCode: "registration_replaced",
          failureMessage:
            "The additional event spot hold expired before checkout completed.",
        },
      });
    }

    const occupied = await occupiedEventSpots(tx, event.id, now);
    const available = Math.max(0, event.capacity - occupied);
    if (guests.names.length > available) {
      return {
        kind: "insufficient" as const,
        paymentId: null,
        available,
      };
    }

    if (fee <= 0) {
      await tx.eventGuestSlot.createMany({
        data: guests.names.map((name) => ({
          eventRegistrationId: registration.id,
          name,
          status: "CONFIRMED" as const,
          confirmedAt: now,
        })),
      });
      return { kind: "confirmed" as const, paymentId: null };
    }

    const venueAmount = fee * guests.names.length;
    const payment = await tx.bookingPayment.create({
      data: {
        partnerId: event.hub.ownerId,
        gatewayId: manualPayment ? null : paymentSetup!.gateway!.id,
        userId: viewer.id,
        hubId: event.hubId,
        amount: new Prisma.Decimal(
          manualPayment ? manualGrossFor(venueAmount) : grossFor(venueAmount)
        ),
        venueAmount: new Prisma.Decimal(venueAmount),
        platformFee: new Prisma.Decimal(
          manualPayment
            ? manualBookingServiceFeeFor(venueAmount)
            : bookingServiceFeeFor(venueAmount)
        ),
        processingFee: new Prisma.Decimal(0),
        method: manualPayment ? "MANUAL" : "QRPH",
        collectionMode: manualPayment ? "MANUAL" : "AUTOMATIC",
        status: "PENDING",
        expiresAt: holdExpiresAt,
        provider: manualPayment
          ? "manual"
          : paymentSetup!.gateway!.provider,
      },
      select: { id: true },
    });
    await tx.eventGuestSlot.createMany({
      data: guests.names.map((name) => ({
        eventRegistrationId: registration.id,
        bookingPaymentId: payment.id,
        name,
        status: "PENDING" as const,
        holdExpiresAt,
      })),
    });
    return { kind: "payment" as const, paymentId: payment.id };
  });

  revalidateEventSurfaces(event.publicId, event.hubId);
  if (outcome.kind === "payment") {
    if (!manualPayment) {
      await chargeBookingPayment({
        paymentId: outcome.paymentId,
        userId: viewer.id,
      });
    }
    redirect(`/events/${event.publicId}/pay/${outcome.paymentId}`);
  }
  if (outcome.kind === "insufficient") {
    return {
      message:
        outcome.available === 0
          ? "No additional spots are available."
          : `Only ${outcome.available} additional spot${outcome.available === 1 ? " is" : "s are"} available.`,
    };
  }
  if (outcome.kind === "not-confirmed") {
    return { message: "Confirm your own registration before adding guests." };
  }
  return { success: `${guests.names.length} guest spot${guests.names.length === 1 ? "" : "s"} added.` };
}

export async function addOrganizerEventGuestsAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const partner = await requireActivePartner();
  const eventId = String(formData.get("eventId") ?? "");
  const guests = guestNamesFrom(formData);
  if (!eventId) return { message: "Event not found." };
  if (!guests.ok) return { message: guests.message };
  if (guests.names.length === 0) {
    return { message: "Add at least one guest name." };
  }

  const now = new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`
    );

    const event = await tx.event.findFirst({
      where: { id: eventId, hub: { ownerId: partner.id } },
      select: {
        id: true,
        publicId: true,
        hubId: true,
        status: true,
        startsAt: true,
        capacity: true,
      },
    });
    if (!event) return { kind: "missing" as const };
    if (event.status !== "PUBLISHED" || event.startsAt <= now) {
      return { kind: "closed" as const, event };
    }

    await expireEventCapacityHolds(tx, event.id, now);
    const occupied = await occupiedEventSpots(tx, event.id, now);
    const available = Math.max(0, event.capacity - occupied);
    if (guests.names.length > available) {
      return { kind: "insufficient" as const, event, available };
    }

    await tx.eventOrganizerGuest.createMany({
      data: guests.names.map((name) => ({
        eventId: event.id,
        createdById: partner.id,
        name,
        status: "CONFIRMED" as const,
        confirmedAt: now,
      })),
    });
    return { kind: "created" as const, event };
  });

  if (outcome.kind === "missing") return { message: "Event not found." };
  revalidateEventSurfaces(outcome.event.publicId, outcome.event.hubId);
  if (outcome.kind === "closed") {
    return { message: "Guests can be added only before a published event starts." };
  }
  if (outcome.kind === "insufficient") {
    return {
      message:
        outcome.available === 0
          ? "No spots are available for complimentary guests."
          : `Only ${outcome.available} spot${outcome.available === 1 ? " is" : "s are"} available. Reduce the guest list and try again.`,
    };
  }

  await recordImpersonatedAction({
    action: "EVENT_ORGANIZER_GUESTS_ADDED",
    targetType: "Event",
    targetId: outcome.event.id,
    metadata: { guestCount: guests.names.length },
  });
  return {
    success: `${guests.names.length} complimentary guest${guests.names.length === 1 ? "" : "s"} added.`,
  };
}

export async function removeOrganizerEventGuestAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const partner = await requireActivePartner();
  const parsed = OrganizerGuestSchema.safeParse({
    guestId: String(formData.get("guestId") ?? ""),
  });
  if (!parsed.success) return { message: "Guest not found." };

  const guest = await prisma.eventOrganizerGuest.findFirst({
    where: {
      id: parsed.data.guestId,
      event: { hub: { ownerId: partner.id } },
    },
    select: {
      id: true,
      status: true,
      event: { select: { id: true, publicId: true, hubId: true } },
    },
  });
  if (!guest) return { message: "Guest not found." };
  if (guest.status !== "CONFIRMED") {
    return { message: "That complimentary guest has already been removed." };
  }

  const removed = await prisma.eventOrganizerGuest.updateMany({
    where: { id: guest.id, status: "CONFIRMED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (removed.count !== 1) {
    return { message: "That complimentary guest has already been removed." };
  }

  revalidateEventSurfaces(guest.event.publicId, guest.event.hubId);
  await recordImpersonatedAction({
    action: "EVENT_ORGANIZER_GUEST_REMOVED",
    targetType: "EventOrganizerGuest",
    targetId: guest.id,
    metadata: { eventId: guest.event.id },
  });
  return { success: "Complimentary guest removed." };
}

export async function cancelEventAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const partner = await requireActivePartner();
  const parsed = CancelEventSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    refund: formData.get("refund") === "full" ? "full" : "none",
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const event = await prisma.event.findFirst({
    where: { id: parsed.data.eventId, hub: { ownerId: partner.id } },
    select: {
      id: true,
      publicId: true,
      hubId: true,
      status: true,
      registrations: {
        select: {
          bookingPaymentId: true,
          payment: { select: { status: true } },
          guests: {
            select: {
              bookingPaymentId: true,
              payment: { select: { status: true } },
            },
          },
        },
      },
    },
  });
  if (!event) return { message: "Event not found." };
  if (event.status === "CANCELLED") return { message: "Event already cancelled." };

  await prisma.$transaction([
    prisma.bookingSlot.deleteMany({ where: { eventId: event.id } }),
    prisma.event.update({
      where: { id: event.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: parsed.data.reason,
      },
    }),
    prisma.eventRegistration.updateMany({
      where: {
        eventId: event.id,
        status: { in: ["PENDING", "CONFIRMED", "WAITLISTED"] },
      },
      data: {
        status: "CANCELLED",
        holdExpiresAt: null,
        cancelledAt: new Date(),
        cancelReason: parsed.data.reason,
      },
    }),
    prisma.eventGuestSlot.updateMany({
      where: {
        registration: { eventId: event.id },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      data: {
        status: "CANCELLED",
        holdExpiresAt: null,
        cancelledAt: new Date(),
      },
    }),
    prisma.eventOrganizerGuest.updateMany({
      where: { eventId: event.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
  ]);

  let failedRefunds = 0;
  if (parsed.data.refund === "full") {
    const paymentIds = new Set<string>();
    for (const registration of event.registrations) {
      if (
        registration.bookingPaymentId &&
        registration.payment?.status === "SUCCEEDED"
      ) {
        paymentIds.add(registration.bookingPaymentId);
      }
      for (const guest of registration.guests) {
        if (
          guest.bookingPaymentId &&
          guest.payment?.status === "SUCCEEDED"
        ) {
          paymentIds.add(guest.bookingPaymentId);
        }
      }
    }
    for (const paymentId of paymentIds) {
      const refund = await refundBookingPayment({
        paymentId,
        reason: parsed.data.reason,
        refundedById: partner.id,
      });
      if (!refund.ok) failedRefunds += 1;
    }
  }

  revalidateEventSurfaces(event.publicId, event.hubId);
  await recordImpersonatedAction({
    action: "EVENT_CANCELLED",
    targetType: "Event",
    targetId: event.id,
    metadata: {
      refundRequested: parsed.data.refund === "full",
      failedRefunds,
    },
  });
  return failedRefunds > 0
    ? {
        success: `Event cancelled, but ${failedRefunds} refund${failedRefunds === 1 ? "" : "s"} need manual follow-up.`,
      }
    : { success: "Event cancelled and court hours released." };
}

// Cancelled events with no payment record can be removed permanently. Once a
// checkout exists, the event and registration relation becomes part of the
// financial audit trail and must remain available for refunds and reporting.
export async function deleteCancelledEventAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const partner = await requireActivePartner();
  const parsed = DeleteCancelledEventSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
  });
  if (!parsed.success) return { message: "Event not found." };

  const outcome = await prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: {
        id: parsed.data.eventId,
        hub: { ownerId: partner.id },
      },
      select: {
        id: true,
        publicId: true,
        hubId: true,
        title: true,
        status: true,
        registrations: {
          where: {
            OR: [
              { bookingPaymentId: { not: null } },
              { guests: { some: { bookingPaymentId: { not: null } } } },
            ],
          },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!event) return { status: "missing" as const };
    if (event.status !== "CANCELLED") {
      return { status: "not-cancelled" as const };
    }
    if (event.registrations.length > 0) {
      return { status: "payment-history" as const };
    }

    await tx.event.delete({ where: { id: event.id } });
    return { status: "deleted" as const, event };
  });

  if (outcome.status === "missing") return { message: "Event not found." };
  if (outcome.status === "not-cancelled") {
    return { message: "Only cancelled events can be deleted." };
  }
  if (outcome.status === "payment-history") {
    return {
      message:
        "This event has payment history and must be kept for refunds and reports.",
    };
  }

  revalidateEventSurfaces(outcome.event.publicId, outcome.event.hubId);
  await recordImpersonatedAction({
    action: "EVENT_DELETED",
    targetType: "Event",
    targetId: outcome.event.id,
    metadata: { title: outcome.event.title, previousStatus: "CANCELLED" },
  });
  return { success: "Cancelled event deleted." };
}

export async function cancelEventRegistrationAction(
  _previous: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const partner = await requireActivePartner();
  const parsed = ManageRegistrationSchema.safeParse({
    registrationId: String(formData.get("registrationId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    refund: formData.get("refund") === "full" ? "full" : "none",
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const registration = await prisma.eventRegistration.findFirst({
    where: {
      id: parsed.data.registrationId,
      event: { hub: { ownerId: partner.id } },
    },
    select: {
      id: true,
      status: true,
      bookingPaymentId: true,
      payment: { select: { status: true } },
      guests: {
        select: {
          bookingPaymentId: true,
          payment: { select: { status: true } },
        },
      },
      event: { select: { publicId: true, hubId: true } },
    },
  });
  if (!registration) return { message: "Registration not found." };
  if (["CANCELLED", "EXPIRED"].includes(registration.status)) {
    return { message: "That registration is already closed." };
  }

  await prisma.$transaction([
    prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: "CANCELLED",
        holdExpiresAt: null,
        cancelledAt: new Date(),
        cancelReason: parsed.data.reason || "Cancelled by the organizer.",
      },
    }),
    prisma.eventGuestSlot.updateMany({
      where: {
        eventRegistrationId: registration.id,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      data: {
        status: "CANCELLED",
        holdExpiresAt: null,
        cancelledAt: new Date(),
      },
    }),
  ]);

  let refundMessage = "";
  if (parsed.data.refund === "full") {
    const paymentIds = new Set<string>();
    if (
      registration.bookingPaymentId &&
      registration.payment?.status === "SUCCEEDED"
    ) {
      paymentIds.add(registration.bookingPaymentId);
    }
    for (const guest of registration.guests) {
      if (guest.bookingPaymentId && guest.payment?.status === "SUCCEEDED") {
        paymentIds.add(guest.bookingPaymentId);
      }
    }
    const failures: string[] = [];
    for (const paymentId of paymentIds) {
      const refund = await refundBookingPayment({
        paymentId,
        reason: parsed.data.reason,
        refundedById: partner.id,
      });
      if (!refund.ok) failures.push(refund.message);
    }
    if (failures.length > 0) {
      refundMessage = ` ${failures.length} refund${failures.length === 1 ? "" : "s"} failed: ${failures.join(" ")}`;
    }
  }

  revalidateEventSurfaces(
    registration.event.publicId,
    registration.event.hubId
  );
  await recordImpersonatedAction({
    action: "EVENT_REGISTRATION_CANCELLED",
    targetType: "EventRegistration",
    targetId: registration.id,
    metadata: { refundRequested: parsed.data.refund === "full" },
  });
  return { success: `Registration cancelled.${refundMessage}` };
}
