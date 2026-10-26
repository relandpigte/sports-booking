import "server-only";

import type { Prisma } from "@prisma/client";

// Legacy service-fee ledger. Before platform collection, a venue that took a
// payment on its own PayMongo account owed Bunal.club the fee, recorded here.
// The settlement flow that collected these balances, its reminders, and the
// booking pause for an overdue balance are retired; the rows remain as
// history. These writers still run for a pre-cutover DIRECT payment that
// settles or is refunded late, and are no-ops for zero-fee payments.

export async function ensureServiceFeeCharge(
  tx: Prisma.TransactionClient,
  payment: {
    id: string;
    partnerId: string;
    platformFee: Prisma.Decimal;
    paidAt?: Date | null;
  }
): Promise<void> {
  if (Number(payment.platformFee) <= 0) return;

  const feeSnapshot = await tx.bookingPayment.findUnique({
    where: { id: payment.id },
    select: {
      processingFee: true,
      processingFeeResponsibility: true,
    },
  });

  await tx.serviceFeeEntry.upsert({
    where: {
      bookingPaymentId_type: {
        bookingPaymentId: payment.id,
        type: "CHARGE",
      },
    },
    create: {
      partnerId: payment.partnerId,
      bookingPaymentId: payment.id,
      type: "CHARGE",
      amount: payment.platformFee,
      createdAt: payment.paidAt ?? undefined,
    },
    update: {},
  });

  if (
    feeSnapshot?.processingFeeResponsibility === "BUNAL" &&
    Number(feeSnapshot.processingFee) > 0
  ) {
    await tx.serviceFeeEntry.upsert({
      where: {
        bookingPaymentId_type: {
          bookingPaymentId: payment.id,
          type: "PROCESSING_CREDIT",
        },
      },
      create: {
        partnerId: payment.partnerId,
        bookingPaymentId: payment.id,
        type: "PROCESSING_CREDIT",
        amount: feeSnapshot.processingFee.negated(),
        createdAt: payment.paidAt ?? undefined,
      },
      // A status poll can settle with the configured estimate milliseconds
      // before the signed webhook supplies PayMongo's exact fee.
      update: { amount: feeSnapshot.processingFee.negated() },
    });
  }
}

export async function ensureOrganizerGuestServiceFeeRefund(
  tx: Prisma.TransactionClient,
  input: {
    eventOrganizerGuestId: string;
    partnerId: string;
    createdAt?: Date;
  }
): Promise<void> {
  const charge = await tx.serviceFeeEntry.findUnique({
    where: {
      eventOrganizerGuestId_type: {
        eventOrganizerGuestId: input.eventOrganizerGuestId,
        type: "CHARGE",
      },
    },
    select: { amount: true },
  });
  if (!charge || Number(charge.amount) <= 0) return;

  await tx.serviceFeeEntry.upsert({
    where: {
      eventOrganizerGuestId_type: {
        eventOrganizerGuestId: input.eventOrganizerGuestId,
        type: "REFUND",
      },
    },
    create: {
      partnerId: input.partnerId,
      eventOrganizerGuestId: input.eventOrganizerGuestId,
      type: "REFUND",
      amount: charge.amount.negated(),
      createdAt: input.createdAt,
    },
    update: {},
  });
}
