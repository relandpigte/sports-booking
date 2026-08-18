"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { firstErrors } from "@/lib/zod-errors";
import { PayBookingSchema } from "@/lib/validation";
import { chargeBookingPayment } from "@/lib/booking-payments";
import { consumeRateLimit } from "@/lib/rate-limit";

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

function revalidateHeldBookingPaths(paymentId: string, hubId?: string) {
  revalidatePath(`/dashboard/bookings/pay/${paymentId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  if (hubId) {
    revalidatePath(`/hubs/${hubId}`);
    revalidatePath(`/dashboard/hubs/${hubId}/bookings`);
  }
}

// The dock's Pay now action prepares automatic QR Ph payment before routing
// to the checkout page. Manual payments need no provider call and go straight
// to the venue's transfer instructions.
export async function continueHeldBookingPaymentAction(
  _prev: HeldBookingActionState,
  formData: FormData
): Promise<HeldBookingActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Sign in with the player account that made this booking." };
  }

  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid booking hold." };

  const payment = await prisma.bookingPayment.findFirst({
    where: { id: parsed.data.paymentId, userId: viewer.id },
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
    redirect(`/dashboard/bookings/pay/${payment.id}`);
  }

  const outcome = await chargeBookingPayment({
    paymentId: payment.id,
    userId: viewer.id,
  });
  revalidateHeldBookingPaths(payment.id, payment.hubId);

  switch (outcome.status) {
    case "action":
    case "confirmed":
    case "pending":
    case "in-flight":
    case "already-paid":
      redirect(`/dashboard/bookings/pay/${payment.id}`);
    case "declined":
      return { message: outcome.message };
    case "expired":
      return { message: "This hold expired and the hours are available to book again." };
    default:
      return { message: "We couldn't find that booking hold." };
  }
}

// A hold can be released only before any transfer proof or provider payment
// begins. Locking the payment row serializes this with the automatic-payment
// claim, so exactly one of Release slots or Pay now can win.
export async function releaseBookingHoldAction(
  _prev: HeldBookingActionState,
  formData: FormData
): Promise<HeldBookingActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Sign in with the player account that made this booking." };
  }
  if (!(await consumeRateLimit({
    namespace: "booking-hold-release",
    subject: viewer.id,
    limit: 20,
    windowSeconds: 10 * 60,
  }))) {
    return { message: "Too many requests. Wait a moment and try again." };
  }

  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { message: "Choose a valid booking hold." };

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
        AND payment."userId" = ${viewer.id}
      FOR UPDATE
    `);
    if (!payment) return { kind: "missing" as const };
    if (payment.status !== "PENDING") {
      return { kind: "closed" as const, hubId: payment.hubId };
    }
    if (payment.expiresAt <= now) {
      return { kind: "expired" as const, hubId: payment.hubId };
    }
    if (
      payment.chargeStartedAt ||
      payment.providerPaymentId ||
      payment.manualSubmittedAt
    ) {
      return { kind: "started" as const, hubId: payment.hubId };
    }

    const bookings = await tx.booking.findMany({
      where: {
        bookingPaymentId: payment.id,
        userId: viewer.id,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (bookings.length === 0) {
      return { kind: "closed" as const, hubId: payment.hubId };
    }
    const bookingIds = bookings.map((booking) => booking.id);

    await tx.bookingSlot.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await tx.booking.updateMany({
      where: { id: { in: bookingIds }, status: "PENDING" },
      data: { status: "EXPIRED", holdExpiresAt: null },
    });
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
        failureMessage: "The player released these slots before payment began.",
      },
    });
    if (closed.count !== 1) {
      throw new Error("Booking hold changed while it was being released.");
    }

    return { kind: "released" as const, hubId: payment.hubId };
  });

  revalidateHeldBookingPaths(parsed.data.paymentId, result.hubId);
  switch (result.kind) {
    case "released":
      return { released: true };
    case "started":
      return {
        message: "Payment has already started, so these slots can no longer be released here.",
      };
    case "expired":
      return { released: true };
    case "closed":
      return { message: "This booking hold is already closed." };
    default:
      return { message: "We couldn't find that booking hold." };
  }
}

export async function payForBookingAction(
  _prev: PayBookingFormState,
  formData: FormData
): Promise<PayBookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to pay for your booking." };

  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Ownership is enforced inside, in the where clause.
  const outcome = await chargeBookingPayment({
    paymentId: parsed.data.paymentId,
    userId: viewer.id,
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
