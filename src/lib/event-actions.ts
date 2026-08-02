"use server";

import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { BOOKING_HOLD_MINUTES, bookingServiceFeeFor, grossFor } from "@/lib/constants";
import { getViewer, requireActivePartner } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getEventCourtAvailability } from "@/lib/events";
import { getActivePartnerGateway } from "@/lib/partner-gateway";
import { refundBookingPayment } from "@/lib/booking-payments";
import { isServiceFeeOverdue } from "@/lib/service-fees";
import { isValidDateString, manilaInstant, manilaToday } from "@/lib/time";
import { firstErrors } from "@/lib/zod-errors";

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

const ManageRegistrationSchema = z.object({
  registrationId: z.string().min(1),
  reason: z.string().trim().max(1_000).optional(),
  refund: z.enum(["full", "none"]).catch("full"),
});

export type EventFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

function revalidateEventSurfaces(publicId: string, hubId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${publicId}`);
  revalidatePath("/dashboard/events");
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
          partnerGateway: { select: { disconnectedAt: true } },
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
              ],
            },
            select: { id: true },
          },
        },
      })
    : null;
  if (values.eventId && !existing) return { message: "Event not found." };
  if (existing?.status === "CANCELLED") {
    return { message: "A cancelled event cannot be edited." };
  }

  const occupied = existing?.registrations.length ?? 0;
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
    hub.owner.partnerGateway?.disconnectedAt !== null
  ) {
    return {
      errors: {
        registrationFee:
          "Connect PayMongo before publishing a paid event. Free events can be published now.",
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
  redirect(
    willPublish ? `/events/${publicId}` : `/dashboard/events/${publicId}/edit`
  );
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

  const publicId = String(formData.get("publicId") ?? "");
  if (!publicId) return { message: "Event not found." };

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
    event.hub.owner.partnerStatus !== "ACTIVE"
  ) {
    return { message: "This event is not open for registration." };
  }
  if (event.startsAt <= new Date()) {
    return { message: "Registration has closed for this event." };
  }

  const fee = Number(event.registrationFee);
  const [gateway, overdue] =
    fee > 0
      ? await Promise.all([
          getActivePartnerGateway(event.hub.ownerId),
          isServiceFeeOverdue(event.hub.ownerId),
        ])
      : [null, false];
  if (fee > 0 && !gateway) {
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

    await tx.eventRegistration.updateMany({
      where: {
        eventId: event.id,
        status: "PENDING",
        holdExpiresAt: { lte: now },
      },
      data: { status: "EXPIRED", holdExpiresAt: null },
    });

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
            providerPaymentId: true,
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
        existing.payment.providerPaymentId != null)
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
          providerPaymentId: null,
        },
        data: {
          status: "FAILED",
          failureCode: "registration_replaced",
          failureMessage:
            "The registration hold expired before checkout started.",
        },
      });
    }
    if (existing?.payment?.status === "SUCCEEDED") {
      return { kind: "paid-closed" as const, paymentId: null };
    }

    const occupied = await tx.eventRegistration.count({
      where: {
        eventId: event.id,
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", holdExpiresAt: { gt: now } },
        ],
      },
    });
    if (occupied >= event.capacity) {
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
      await tx.eventRegistration.upsert({
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
      });
      return { kind: "confirmed" as const, paymentId: null };
    }

    const payment = await tx.bookingPayment.create({
      data: {
        partnerId: event.hub.ownerId,
        gatewayId: gateway!.id,
        userId: viewer.id,
        hubId: event.hubId,
        amount: new Prisma.Decimal(grossFor(fee)),
        venueAmount: new Prisma.Decimal(fee),
        platformFee: new Prisma.Decimal(bookingServiceFeeFor(fee)),
        method: "CARD",
        status: "PENDING",
        expiresAt: holdExpiresAt,
        provider: gateway!.provider,
      },
      select: { id: true },
    });
    await tx.eventRegistration.upsert({
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
    });
    return { kind: "payment" as const, paymentId: payment.id };
  });

  revalidateEventSurfaces(event.publicId, event.hubId);
  if (outcome.kind === "payment") {
    redirect(`/events/${event.publicId}/pay/${outcome.paymentId}`);
  }
  if (outcome.kind === "paid-closed") {
    return {
      message:
        "This paid registration was previously closed. Contact the organizer before registering again.",
    };
  }
  return outcome.kind === "waitlist"
    ? { success: "You're on the free waitlist. Check back when a spot opens." }
    : { success: "You're registered for this event." };
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
        where: { payment: { status: "SUCCEEDED" } },
        select: { bookingPaymentId: true },
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
  ]);

  let failedRefunds = 0;
  if (parsed.data.refund === "full") {
    for (const registration of event.registrations) {
      if (!registration.bookingPaymentId) continue;
      const refund = await refundBookingPayment({
        paymentId: registration.bookingPaymentId,
        reason: parsed.data.reason,
        refundedById: partner.id,
      });
      if (!refund.ok) failedRefunds += 1;
    }
  }

  revalidateEventSurfaces(event.publicId, event.hubId);
  return failedRefunds > 0
    ? {
        success: `Event cancelled, but ${failedRefunds} refund${failedRefunds === 1 ? "" : "s"} need manual follow-up.`,
      }
    : { success: "Event cancelled and court hours released." };
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
      event: { select: { publicId: true, hubId: true } },
    },
  });
  if (!registration) return { message: "Registration not found." };
  if (["CANCELLED", "EXPIRED"].includes(registration.status)) {
    return { message: "That registration is already closed." };
  }

  await prisma.eventRegistration.update({
    where: { id: registration.id },
    data: {
      status: "CANCELLED",
      holdExpiresAt: null,
      cancelledAt: new Date(),
      cancelReason: parsed.data.reason || "Cancelled by the organizer.",
    },
  });

  let refundMessage = "";
  if (
    parsed.data.refund === "full" &&
    registration.payment?.status === "SUCCEEDED" &&
    registration.bookingPaymentId
  ) {
    const refund = await refundBookingPayment({
      paymentId: registration.bookingPaymentId,
      reason: parsed.data.reason,
      refundedById: partner.id,
    });
    if (!refund.ok) refundMessage = ` Refund failed: ${refund.message}`;
  }

  revalidateEventSurfaces(
    registration.event.publicId,
    registration.event.hubId
  );
  return { success: `Registration cancelled.${refundMessage}` };
}
