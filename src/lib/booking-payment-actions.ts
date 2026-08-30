"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { firstErrors } from "@/lib/zod-errors";
import { PayBookingSchema } from "@/lib/validation";
import {
  cancelAutomaticBookingHold,
  chargeBookingPayment,
  type BookingPaymentOwner,
} from "@/lib/booking-payments";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  getCurrentGuestReservationId,
  guestBookingPath,
} from "@/lib/guest-bookings";

// Starting a payment is now a single button: PayMongo hosts the form, so there
// is no method to choose here and no card detail to collect — which is why this
// file has no `values` echo and no card fields. Nothing sensitive passes
// through.
export type PayBookingFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  // Where PayMongo wants the payer to go. The client sends the browser there;
  // the hold keeps running while they're away.
  redirectUrl?: string;
  qrImageUrl?: string;
};

export type HeldBookingActionState = {
  message?: string;
  released?: boolean;
};

function revalidateHeldBookingPaths(
  paymentId: string,
  hubId?: string,
  eventPublicId?: string | null
) {
  revalidatePath(`/dashboard/bookings/pay/${paymentId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  if (hubId) {
    revalidatePath(`/hubs/${hubId}`);
    revalidatePath(`/dashboard/hubs/${hubId}/bookings`);
  }
  if (eventPublicId) {
    revalidatePath(`/events/${eventPublicId}`);
    revalidatePath(`/events/${eventPublicId}/pay/${paymentId}`);
  }
}

async function resolveBookingPaymentOwner(
  paymentId: string
): Promise<{ owner: BookingPaymentOwner; guestReservationId: string | null } | null> {
  const [viewer, payment] = await Promise.all([
    getViewer(),
    prisma.bookingPayment.findUnique({
      where: { id: paymentId },
      select: { userId: true, guestReservationId: true },
    }),
  ]);
  if (!payment) return null;
  if (viewer?.role === "PLAYER" && payment.userId === viewer.id) {
    return { owner: { userId: viewer.id }, guestReservationId: null };
  }
  const guestReservationId = await getCurrentGuestReservationId();
  if (
    guestReservationId &&
    payment.guestReservationId === guestReservationId
  ) {
    return {
      owner: { guestReservationId },
      guestReservationId,
    };
  }
  return null;
}

// The dock's Pay now action prepares automatic QR Ph payment before routing
// to the checkout page. Manual payments need no provider call and go straight
// to the venue's transfer instructions.
export async function continueHeldBookingPaymentAction(
  _prev: HeldBookingActionState,
  formData: FormData
): Promise<HeldBookingActionState> {
  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid booking hold." };

  const access = await resolveBookingPaymentOwner(parsed.data.paymentId);
  if (!access) return { message: "This private booking access is unavailable." };

  const payment = await prisma.bookingPayment.findFirst({
    where: { id: parsed.data.paymentId, ...access.owner },
    select: {
      id: true,
      hubId: true,
      status: true,
      expiresAt: true,
      collectionMode: true,
    },
  });
  if (!payment) return { message: "We couldn't find that booking hold." };
  if (payment.status !== "PENDING" || payment.expiresAt <= new Date()) {
    return { message: "This hold expired and the hours are available to book again." };
  }

  revalidateHeldBookingPaths(payment.id, payment.hubId);
  if (payment.collectionMode === "MANUAL") {
    redirect(
      access.guestReservationId
        ? guestBookingPath(access.guestReservationId)
        : `/dashboard/bookings/pay/${payment.id}`
    );
  }

  const outcome = await chargeBookingPayment({
    paymentId: payment.id,
    ...access.owner,
  });
  revalidateHeldBookingPaths(payment.id, payment.hubId);

  switch (outcome.status) {
    case "action":
    case "confirmed":
    case "pending":
    case "in-flight":
    case "already-paid":
      redirect(
        access.guestReservationId
          ? guestBookingPath(access.guestReservationId)
          : `/dashboard/bookings/pay/${payment.id}`
      );
    case "declined":
      return { message: outcome.message };
    case "expired":
      return { message: "This hold expired and the hours are available to book again." };
    default:
      return { message: "We couldn't find that booking hold." };
  }
}

// Before payment begins, a court or event hold can be released immediately.
// Once a direct QR intent exists, cancelAutomaticBookingHold cancels it at
// PayMongo first and frees inventory only after the provider confirms no late
// payment can arrive.
export async function releaseBookingHoldAction(
  _prev: HeldBookingActionState,
  formData: FormData
): Promise<HeldBookingActionState> {
  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid booking hold." };
  const access = await resolveBookingPaymentOwner(parsed.data.paymentId);
  if (!access) return { message: "This private booking access is unavailable." };
  const rateSubject = access.owner.userId
    ? access.owner.userId
    : `guest:${access.owner.guestReservationId}`;
  if (!(await consumeRateLimit({
    namespace: "booking-hold-release",
    subject: rateSubject,
    limit: 20,
    windowSeconds: 10 * 60,
  }))) {
    return { message: "Too many requests. Wait a moment and try again." };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [payment] = await tx.$queryRaw<
      Array<{
        id: string;
        hubId: string;
        status: string;
        expiresAt: Date;
        chargeStartedAt: Date | null;
        providerPaymentId: string | null;
        manualSubmittedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        payment."id",
        payment."hubId",
        payment."status"::text AS "status",
        payment."expiresAt",
        payment."chargeStartedAt",
        payment."providerPaymentId",
        payment."manualSubmittedAt"
      FROM "BookingPayment" payment
      WHERE payment."id" = ${parsed.data.paymentId}
        AND ${access.owner.userId
          ? Prisma.sql`payment."userId" = ${access.owner.userId}`
          : Prisma.sql`payment."guestReservationId" = ${access.owner.guestReservationId}`}
      FOR UPDATE
    `);
    if (!payment) return { kind: "missing" as const };
    const eventRegistration = await tx.eventRegistration.findFirst({
      where: {
        bookingPaymentId: payment.id,
        status: "PENDING",
      },
      select: { id: true, event: { select: { publicId: true } } },
    });
    const eventGuestSlots = await tx.eventGuestSlot.findMany({
      where: {
        bookingPaymentId: payment.id,
        status: "PENDING",
      },
      select: {
        id: true,
        registration: {
          select: { event: { select: { publicId: true } } },
        },
      },
    });
    const eventPublicId =
      eventRegistration?.event.publicId ??
      eventGuestSlots[0]?.registration.event.publicId ??
      null;
    if (payment.status !== "PENDING") {
      return {
        kind: "closed" as const,
        hubId: payment.hubId,
        eventPublicId,
      };
    }
    if (payment.expiresAt <= now) {
      return {
        kind: "expired" as const,
        hubId: payment.hubId,
        eventPublicId,
      };
    }
    if (
      payment.chargeStartedAt ||
      payment.providerPaymentId ||
      payment.manualSubmittedAt
    ) {
      return {
        kind: "started" as const,
        hubId: payment.hubId,
        eventPublicId,
      };
    }

    const bookings = await tx.booking.findMany({
      where: {
        bookingPaymentId: payment.id,
        ...access.owner,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (
      bookings.length === 0 &&
      !eventRegistration &&
      eventGuestSlots.length === 0
    ) {
      return {
        kind: "closed" as const,
        hubId: payment.hubId,
        eventPublicId,
      };
    }
    const bookingIds = bookings.map((booking) => booking.id);

    if (bookingIds.length > 0) {
      await tx.bookingSlot.deleteMany({
        where: { bookingId: { in: bookingIds } },
      });
      await tx.booking.deleteMany({
        where: { id: { in: bookingIds }, status: "PENDING" },
      });
    }
    if (eventGuestSlots.length > 0) {
      await tx.eventGuestSlot.updateMany({
        where: {
          id: { in: eventGuestSlots.map((guest) => guest.id) },
          status: "PENDING",
        },
        data: {
          status: "CANCELLED",
          holdExpiresAt: null,
          cancelledAt: now,
        },
      });
    }
    if (eventRegistration) {
      await tx.eventRegistration.updateMany({
        where: { id: eventRegistration.id, status: "PENDING" },
        data: {
          status: "CANCELLED",
          holdExpiresAt: null,
          cancelledAt: now,
          cancelReason: "Cancelled by the player before payment.",
        },
      });
    }
    const closed = await tx.bookingPayment.updateMany({
      where: {
        id: payment.id,
        status: "PENDING",
        chargeStartedAt: null,
        providerPaymentId: null,
        manualSubmittedAt: null,
      },
      data: {
        status: "FAILED",
        failureCode: "player_released",
        failureMessage:
          "The player released this reservation before payment began.",
      },
    });
    if (closed.count !== 1) {
      throw new Error("Booking hold changed while it was being released.");
    }

    return {
      kind: "released" as const,
      hubId: payment.hubId,
      eventPublicId,
    };
  });

  revalidateHeldBookingPaths(
    parsed.data.paymentId,
    "hubId" in result ? result.hubId : undefined,
    "eventPublicId" in result ? result.eventPublicId : undefined
  );
  switch (result.kind) {
    case "released":
      return { released: true };
    case "started": {
      const cancelled = await cancelAutomaticBookingHold({
        paymentId: parsed.data.paymentId,
        ...access.owner,
      });
      revalidateHeldBookingPaths(
        parsed.data.paymentId,
        "hubId" in cancelled ? cancelled.hubId : result.hubId,
        "eventPublicId" in cancelled
          ? cancelled.eventPublicId
          : result.eventPublicId
      );
      if (cancelled.status === "cancelled") return { released: true };
      if (cancelled.status === "already-paid") {
        return {
          message:
            "Payment completed before cancellation. Your reservation is confirmed.",
        };
      }
      if (cancelled.status === "closed") {
        return { message: "This reservation hold is already closed." };
      }
      if (cancelled.status === "unavailable") {
        return { message: cancelled.message };
      }
      return { message: "We couldn't find that reservation hold." };
    }
    case "expired":
      return { released: true };
    case "closed":
      return { message: "This reservation hold is already closed." };
    default:
      return { message: "We couldn't find that reservation hold." };
  }
}

export async function payForBookingAction(
  _prev: PayBookingFormState,
  formData: FormData
): Promise<PayBookingFormState> {
  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const access = await resolveBookingPaymentOwner(parsed.data.paymentId);
  if (!access) return { message: "This private booking access is unavailable." };

  // Ownership is enforced inside, in the where clause.
  const outcome = await chargeBookingPayment({
    paymentId: parsed.data.paymentId,
    ...access.owner,
  });

  revalidateHeldBookingPaths(parsed.data.paymentId);

  switch (outcome.status) {
    case "action":
      return {
        redirectUrl: outcome.redirectUrl ?? undefined,
        qrImageUrl: outcome.qrImageUrl ?? undefined,
      };
    case "confirmed":
      return { success: "Paid. Your court is confirmed." };
    case "pending":
      return {
        success:
          "Your payment is being processed. This page updates as soon as it clears.",
      };
    case "declined":
      return { message: outcome.message };
    case "expired":
      return {
        message:
          "This hold has expired and the hours have been released. Nothing was charged — please book again.",
      };
    case "in-flight":
      return { message: "That payment is already being processed." };
    case "already-paid":
      return { success: "This booking is already paid for." };
    default:
      return { message: "We couldn't find that payment." };
  }
}
