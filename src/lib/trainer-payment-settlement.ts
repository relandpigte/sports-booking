import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendTrainerLifecycleEmail } from "@/lib/email";
import { railForTrainerPayment } from "@/lib/payment-rails";
import type { ProviderWebhookEvent } from "@/lib/payments/types";
import { ensurePayoutEarning, ensurePayoutRefund } from "@/lib/payouts";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { appUrl } from "@/lib/urls";

// Settlement of trainer-session payments.
//
// This lives outside trainer-payment-actions.ts on purpose. That file is a
// "use server" module, so everything it exports is callable from a browser;
// confirming a payment from a provider event must only ever be reachable from
// a route that has verified the provider's signature.

export function revalidateTrainerPayments(paymentId?: string) {
  revalidatePath("/dashboard/trainer");
  revalidatePath("/dashboard/trainer/payments");
  revalidatePath("/dashboard/trainer/sessions");
  revalidatePath("/dashboard/bookings");
  if (paymentId) revalidatePath(`/dashboard/trainer-payments/${paymentId}`);
}

export async function sendLifecycle(input: Parameters<typeof sendTrainerLifecycleEmail>[0]) {
  if (!emailDeliveryConfigured() || input.to.endsWith("@example.com")) return;
  try {
    await sendTrainerLifecycleEmail(input);
  } catch (error) {
    console.error(
      "Trainer payment email failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

// What the trainer owes Bunal.club for a payment the trainer collected
// themselves. A platform-collected payment owes nothing — Bunal.club already
// holds the fee — and a fee-free manual payment has nothing to accrue.
async function ensureTrainerFeeEntries(
  tx: Prisma.TransactionClient,
  payment: {
    id: string;
    trainerId: string;
    collectedBy: "DIRECT" | "PLATFORM";
    platformFee: Prisma.Decimal;
    processingFee: Prisma.Decimal;
    processingFeeResponsibility: "PLAYER" | "BUNAL";
  }
) {
  if (payment.collectedBy === "PLATFORM" || Number(payment.platformFee) <= 0) {
    return;
  }
  await tx.trainerServiceFeeEntry.upsert({
    where: {
      trainerPaymentId_type: {
        trainerPaymentId: payment.id,
        type: "CHARGE",
      },
    },
    create: {
      trainerId: payment.trainerId,
      trainerPaymentId: payment.id,
      type: "CHARGE",
      amount: payment.platformFee,
    },
    update: {},
  });
  if (
    payment.processingFeeResponsibility === "BUNAL" &&
    Number(payment.processingFee) > 0
  ) {
    await tx.trainerServiceFeeEntry.upsert({
      where: {
        trainerPaymentId_type: {
          trainerPaymentId: payment.id,
          type: "PROCESSING_CREDIT",
        },
      },
      create: {
        trainerId: payment.trainerId,
        trainerPaymentId: payment.id,
        type: "PROCESSING_CREDIT",
        amount: payment.processingFee.negated(),
      },
      update: { amount: payment.processingFee.negated() },
    });
  }
}

export async function confirmTrainerPayment(
  paymentId: string,
  providerRef?: string | null,
  manualReview?: {
    reviewedById: string;
    note: string | null;
  }
) {
  const now = new Date();
  const current = await prisma.trainerPayment.findUnique({
    where: { id: paymentId },
    include: { session: true },
  });
  if (
    current?.status === "PENDING" &&
    current.collectionMode === "AUTOMATIC" &&
    current.expiresAt <= now
  ) {
    const claimed = await prisma.trainerPayment.updateMany({
      where: { id: current.id, status: "PENDING", refundStartedAt: null },
      data: { refundStartedAt: now },
    });
    const rail =
      claimed.count === 1 && current.providerPaymentId
        ? await railForTrainerPayment(current, "existing")
        : null;
    if (rail && current.providerPaymentId) {
      const refund = await rail.refund(
        current.providerPaymentId,
        { amount: Number(current.amount), currency: "PHP" },
        "Trainer-session payment completed after the hold expired.",
        `trainer-late-refund:${current.id}`
      );
      if (refund.status !== "failed") {
        await prisma.$transaction([
          prisma.trainerPayment.update({ where: { id: current.id }, data: { status: "REFUNDED", refundedAt: now, refundedAmount: current.amount, refundRef: refund.refundId, refundReason: "Payment completed after the trainer-session hold expired." } }),
          prisma.trainerSession.update({ where: { id: current.trainerSessionId }, data: { status: "EXPIRED" } }),
          prisma.trainerSessionSlot.deleteMany({ where: { trainerSessionId: current.trainerSessionId } }),
        ]);
      } else {
        await prisma.trainerPayment.update({ where: { id: current.id }, data: { refundStartedAt: null, failureCode: "late_refund_failed", failureMessage: refund.message } });
      }
    }
    revalidateTrainerPayments(paymentId);
    return null;
  }
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.trainerPayment.findUnique({
      where: { id: paymentId },
      include: {
        session: true,
        trainer: { select: { email: true, name: true, playerName: true } },
        player: { select: { email: true, name: true, playerName: true } },
      },
    });
    if (!payment) return null;
    if (payment.status === "SUCCEEDED") {
      await ensureTrainerFeeEntries(tx, payment);
      await ensurePayoutEarning(tx, { trainerPaymentId: payment.id });
      return payment;
    }
    if (payment.status !== "PENDING") return null;
    if (!["AWAITING_PAYMENT", "PAYMENT_REVIEW"].includes(payment.session.status)) return null;
    await tx.trainerPayment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        paidAt: now,
        providerRef: providerRef ?? payment.providerRef,
        ...(manualReview
          ? {
              manualReviewedAt: payment.manualReviewedAt ?? now,
              manualReviewedById: manualReview.reviewedById,
              manualReviewNote: manualReview.note,
            }
          : {}),
      },
    });
    await tx.trainerSession.update({
      where: { id: payment.trainerSessionId },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    await ensureTrainerFeeEntries(tx, payment);
    // The mirror image for a platform-collected payment: Bunal.club now owes
    // the trainer their share. A no-op for every payment it did not collect.
    await ensurePayoutEarning(tx, { trainerPaymentId: payment.id });
    await tx.chatConversation.upsert({
      where: { trainerSessionId: payment.trainerSessionId },
      create: { kind: "TRAINER_SESSION", trainerSessionId: payment.trainerSessionId },
      update: {},
    });
    return payment;
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });
  if (result) {
    const sessionLabel = `${formatManilaDateLong(result.session.date)}, ${formatSlotRange(result.session.startHour, result.session.endHour)}`;
    await Promise.all([
      sendLifecycle({
        to: result.player.email,
        recipientName: result.player.playerName ?? result.player.name ?? "Player",
        subject: "Trainer session confirmed",
        heading: "Your training session is confirmed",
        message: sessionLabel,
        actionUrl: appUrl("/dashboard/bookings"),
        actionLabel: "View booking",
        idempotencyKey: `trainer-paid-${result.id}-player`,
      }),
      sendLifecycle({
        to: result.trainer.email,
        recipientName: result.trainer.playerName ?? result.trainer.name ?? "Trainer",
        subject: "Trainer session paid",
        heading: "The player's payment is confirmed",
        message: sessionLabel,
        actionUrl: appUrl("/dashboard/trainer/sessions"),
        actionLabel: "View session",
        idempotencyKey: `trainer-paid-${result.id}-trainer`,
      }),
    ]);
  }
  revalidateTrainerPayments(paymentId);
  return result;
}

// Asks the provider what happened to one in-flight payment and settles it.
// The player's open page calls this while it polls; the sweep calls it for
// payments whose webhook never arrived.
export async function reconcileTrainerPayment(payment: {
  id: string;
  status: string;
  gatewayId: string | null;
  collectedBy: "DIRECT" | "PLATFORM";
  providerPaymentId: string | null;
}): Promise<void> {
  if (payment.status !== "PENDING" || !payment.providerPaymentId) return;
  const rail = await railForTrainerPayment(payment, "existing");
  if (!rail) return;
  const result = await rail.getCharge(payment.providerPaymentId);
  if (result.status === "succeeded") {
    await prisma.trainerPayment.update({
      where: { id: payment.id },
      data: {
        providerRef: result.reference,
        ...(result.feeCentavos != null
          ? { processingFee: new Prisma.Decimal(result.feeCentavos / 100) }
          : {}),
        raw: result.raw as Prisma.InputJsonValue,
      },
    });
    await confirmTrainerPayment(payment.id, result.reference);
  } else if (result.status === "failed") {
    await prisma.trainerPayment.update({ where: { id: payment.id }, data: { failureCode: result.code, failureMessage: result.message, chargeStartedAt: null, raw: result.raw as Prisma.InputJsonValue } });
  }
}

// The trainer counterpart of reconcileInFlightBookingPayments: a QR Ph payment
// whose webhook was lost and whose page was closed would otherwise never
// settle, leaving the player's money held with no session to show for it. A
// payment that completed after its hold expired is refunded in full by
// confirmTrainerPayment.
export async function reconcileInFlightTrainerPayments(
  now: Date = new Date()
): Promise<{ checked: number; failed: number }> {
  const payments = await prisma.trainerPayment.findMany({
    where: {
      status: "PENDING",
      collectionMode: "AUTOMATIC",
      providerPaymentId: { not: null },
      chargeStartedAt: { lt: new Date(now.getTime() - 2 * 60_000) },
    },
    orderBy: { chargeStartedAt: "asc" },
    take: 50,
    select: {
      id: true,
      status: true,
      gatewayId: true,
      collectedBy: true,
      providerPaymentId: true,
    },
  });
  const result = { checked: payments.length, failed: 0 };
  for (const payment of payments) {
    try {
      await reconcileTrainerPayment(payment);
    } catch (error) {
      result.failed += 1;
      console.error(
        "In-flight trainer payment reconciliation failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
  return result;
}

// A VERIFIED event from a trainer's own PayMongo account. Scoped to that
// gateway, so one trainer's account can never settle another's payment.
export async function handleTrainerPaymentEvent(args: {
  gatewayId: string;
  webhookToken: string;
  event: ProviderWebhookEvent;
}) {
  const { event } = args;
  if (!event) return { handled: false };
  const endpoint = await prisma.trainerGateway.findFirst({
    where: { id: args.gatewayId, webhookToken: args.webhookToken },
    select: { id: true },
  });
  if (!endpoint) return { handled: false };
  return applyTrainerPaymentEvent(
    { gatewayId: args.gatewayId, providerPaymentId: event.providerPaymentId },
    event
  );
}

// Applies a verified event to the one trainer payment `where` selects. The
// caller supplies the scope — a trainer's own gateway, or Bunal.club's
// platform account — so an event only reaches a payment taken through the
// account that signed it.
export async function applyTrainerPaymentEvent(
  where: Prisma.TrainerPaymentWhereInput,
  event: ProviderWebhookEvent
): Promise<{ handled: boolean; reason?: string }> {
  const payment = await prisma.trainerPayment.findFirst({
    where,
    select: {
      id: true,
      amount: true,
      status: true,
      collectedBy: true,
      refundStartedAt: true,
    },
  });
  if (!payment) return { handled: false, reason: "unknown payment" };
  if (event.type === "payment.succeeded") {
    const expected = Math.round(Number(payment.amount) * 100);
    if (event.amountCentavos != null && event.amountCentavos !== expected) {
      return { handled: false, reason: "amount_mismatch" };
    }
    if (event.feeCentavos != null) {
      await prisma.trainerPayment.update({
        where: { id: payment.id },
        data: { processingFee: new Prisma.Decimal(event.feeCentavos / 100) },
      });
    }
    await confirmTrainerPayment(payment.id, event.reference);
    return { handled: true };
  }
  if (event.type === "payment.failed" && payment.status === "PENDING") {
    await prisma.trainerPayment.update({ where: { id: payment.id }, data: { failureCode: event.failureCode, failureMessage: event.failureMessage, chargeStartedAt: null, raw: event.raw as Prisma.InputJsonValue } });
    return { handled: true };
  }
  // A refund issued from PayMongo's dashboard rather than from here. Only the
  // platform account's refunds are mirrored: that money is owed to the
  // trainer, so the ledger has to learn it went back to the player. A refund
  // this app requested records itself, and holds the claim while it does.
  //
  // The session is deliberately left alone, as on the venue rail: refunding
  // at the gateway is a money decision, not a cancellation.
  if (
    event.type === "payment.refunded" &&
    payment.collectedBy === "PLATFORM" &&
    payment.status === "SUCCEEDED" &&
    payment.refundStartedAt == null
  ) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.trainerPayment.updateMany({
        where: { id: payment.id, status: "SUCCEEDED", refundStartedAt: null },
        data: {
          status: "REFUNDED",
          refundStartedAt: now,
          refundedAt: now,
          refundedAmount:
            event.amountCentavos != null
              ? new Prisma.Decimal(event.amountCentavos / 100)
              : payment.amount,
          refundRef: event.reference,
          refundReason: "Refunded from the payment provider.",
        },
      });
      if (updated.count !== 1) return;
      await ensurePayoutRefund(tx, { trainerPaymentId: payment.id });
    });
    revalidateTrainerPayments(payment.id);
    return { handled: true };
  }
  return { handled: false };
}
