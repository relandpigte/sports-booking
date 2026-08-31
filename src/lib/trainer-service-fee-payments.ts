import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  createTrainerServiceFeeCheckout,
  getServiceFeeCheckout,
} from "@/lib/payments/paymongo-platform";
import {
  PayMongoRequestError,
  paidPayment,
  toPesos,
} from "@/lib/payments/paymongo-core";
import type { ProviderWebhookEvent } from "@/lib/payments/types";
import type { ServiceFeeCheckoutResult } from "@/lib/service-fee-payments";
import { calculateTrainerServiceFeeBalance } from "@/lib/trainer-service-fees";

export const TRAINER_SETTLEMENT_TIMEOUT_MINUTES = 30;

class NoTrainerServiceFeeBalanceError extends Error {}
class TrainerSettlementUnderReviewError extends Error {}

export async function startTrainerServiceFeeCheckout(args: {
  trainerId: string;
  trainerName: string;
}): Promise<ServiceFeeCheckoutResult> {
  let settlement: {
    id: string;
    amount: Prisma.Decimal;
    providerPaymentId: string | null;
    redirectUrl: string | null;
  };

  try {
    settlement = await prisma.$transaction(
      async (tx) => {
        const submitted = await tx.trainerServiceFeeSettlement.count({
          where: { trainerId: args.trainerId, status: "SUBMITTED" },
        });
        if (submitted > 0) throw new TrainerSettlementUnderReviewError();

        const existing = await tx.trainerServiceFeeSettlement.findFirst({
          where: {
            trainerId: args.trainerId,
            status: "AWAITING_PAYMENT",
            provider: "paymongo",
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            providerPaymentId: true,
            redirectUrl: true,
          },
        });
        if (existing) return existing;

        const balance = await calculateTrainerServiceFeeBalance(
          tx,
          args.trainerId
        );
        if (balance.amountDue < 0.01) {
          throw new NoTrainerServiceFeeBalanceError();
        }

        return tx.trainerServiceFeeSettlement.create({
          data: {
            trainerId: args.trainerId,
            periodStart: balance.oldestEntryAt ?? new Date(),
            periodEnd: new Date(),
            amount: new Prisma.Decimal(balance.amountDue),
            processingFeeResponsibility: "BUNAL",
            status: "AWAITING_PAYMENT",
            provider: "paymongo",
          },
          select: {
            id: true,
            amount: true,
            providerPaymentId: true,
            redirectUrl: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof NoTrainerServiceFeeBalanceError) {
      return { status: "none" };
    }
    if (error instanceof TrainerSettlementUnderReviewError) {
      return { status: "under-review" };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return {
        status: "failed",
        message: "The balance changed. Please start the payment again.",
      };
    }
    throw error;
  }

  if (settlement.redirectUrl) {
    return { status: "redirect", url: settlement.redirectUrl };
  }
  if (settlement.providerPaymentId) return { status: "pending" };

  try {
    const checkout = await createTrainerServiceFeeCheckout({
      settlementId: settlement.id,
      trainerId: args.trainerId,
      trainerName: args.trainerName,
      amount: Number(settlement.amount),
    });
    await prisma.trainerServiceFeeSettlement.update({
      where: { id: settlement.id },
      data: {
        providerPaymentId: checkout.providerPaymentId,
        redirectUrl: checkout.redirectUrl,
        raw: checkout.raw as Prisma.InputJsonValue,
      },
    });
    return { status: "redirect", url: checkout.redirectUrl };
  } catch (error) {
    if (error instanceof PayMongoRequestError) {
      if (error.status > 0) {
        await prisma.trainerServiceFeeSettlement.updateMany({
          where: { id: settlement.id, status: "AWAITING_PAYMENT" },
          data: {
            status: "REJECTED",
            reviewNote: `PayMongo checkout failed: ${error.code}`,
          },
        });
      }
      return { status: "failed", message: error.message };
    }
    throw error;
  }
}

export async function markTrainerServiceFeeSettlementPaid(args: {
  providerPaymentId: string;
  reference: string | null;
  raw: unknown;
  amountCentavos?: number;
  feeCentavos?: number;
}): Promise<{ applied: boolean; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.trainerServiceFeeSettlement.findUnique({
      where: { providerPaymentId: args.providerPaymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        processingFeeResponsibility: true,
      },
    });
    if (!settlement) return { applied: false, reason: "unknown settlement" };
    if (settlement.status === "PAID") {
      if (
        settlement.processingFeeResponsibility === "BUNAL" &&
        args.feeCentavos != null
      ) {
        await tx.trainerServiceFeeSettlement.update({
          where: { id: settlement.id },
          data: {
            processingFee: new Prisma.Decimal(args.feeCentavos / 100),
          },
        });
      }
      return { applied: false, reason: "already paid" };
    }
    if (settlement.status !== "AWAITING_PAYMENT") {
      return { applied: false, reason: "not awaiting payment" };
    }
    if (
      args.amountCentavos != null &&
      toPesos(args.amountCentavos) < Number(settlement.amount)
    ) {
      return { applied: false, reason: "underpaid" };
    }

    await tx.trainerServiceFeeSettlement.update({
      where: { id: settlement.id },
      data: {
        status: "PAID",
        paymentReference: args.reference ?? args.providerPaymentId,
        providerRef: args.reference,
        ...(settlement.processingFeeResponsibility === "BUNAL" &&
        args.feeCentavos != null
          ? { processingFee: new Prisma.Decimal(args.feeCentavos / 100) }
          : {}),
        reviewedAt: new Date(),
        reviewNote: "Paid automatically through PayMongo.",
        raw: args.raw as Prisma.InputJsonValue,
      },
    });
    return { applied: true };
  });
}

export async function rejectTrainerServiceFeeSettlement(
  event: ProviderWebhookEvent
): Promise<number> {
  const updated = await prisma.trainerServiceFeeSettlement.updateMany({
    where: {
      providerPaymentId: event.providerPaymentId,
      status: "AWAITING_PAYMENT",
    },
    data: {
      status: "REJECTED",
      reviewNote: event.failureMessage ?? "The PayMongo payment failed.",
      raw: event.raw as Prisma.InputJsonValue,
    },
  });
  return updated.count;
}

export async function pollTrainerServiceFeeCheckout(args: {
  settlementId: string;
  trainerId: string;
}): Promise<ServiceFeeCheckoutResult> {
  const settlement = await prisma.trainerServiceFeeSettlement.findFirst({
    where: {
      id: args.settlementId,
      trainerId: args.trainerId,
      provider: "paymongo",
    },
    select: {
      status: true,
      providerPaymentId: true,
      redirectUrl: true,
    },
  });
  if (!settlement) return { status: "none" };
  if (settlement.status === "PAID") return { status: "paid" };
  if (
    settlement.status !== "AWAITING_PAYMENT" ||
    !settlement.providerPaymentId
  ) {
    return {
      status: "failed",
      message: "That PayMongo payment is no longer active.",
    };
  }

  try {
    const session = await getServiceFeeCheckout(settlement.providerPaymentId);
    const paid = paidPayment(session);
    if (paid?.id) {
      await markTrainerServiceFeeSettlementPaid({
        providerPaymentId: settlement.providerPaymentId,
        reference: paid.id,
        amountCentavos: paid.attributes?.amount,
        feeCentavos: paid.attributes?.fee,
        raw: session,
      });
      return { status: "paid" };
    }
    if (session.status === "expired") {
      await prisma.trainerServiceFeeSettlement.updateMany({
        where: {
          providerPaymentId: settlement.providerPaymentId,
          status: "AWAITING_PAYMENT",
        },
        data: {
          status: "REJECTED",
          reviewNote: "PayMongo checkout expired before payment.",
          raw: session as Prisma.InputJsonValue,
        },
      });
      return {
        status: "failed",
        message: "The PayMongo checkout expired. Start a new payment.",
      };
    }
    return settlement.redirectUrl
      ? { status: "redirect", url: settlement.redirectUrl }
      : { status: "pending" };
  } catch (error) {
    if (error instanceof PayMongoRequestError) return { status: "pending" };
    throw error;
  }
}

export async function pollLatestTrainerServiceFeeCheckout(
  trainerId: string
): Promise<ServiceFeeCheckoutResult> {
  const latest = await prisma.trainerServiceFeeSettlement.findFirst({
    where: {
      trainerId,
      status: "AWAITING_PAYMENT",
      provider: "paymongo",
      providerPaymentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { status: "none" };
  return pollTrainerServiceFeeCheckout({
    settlementId: latest.id,
    trainerId,
  });
}

export async function reconcileTrainerServiceFeeCheckouts(
  now: Date = new Date()
): Promise<{ paid: number; rejected: number; pending: number; failed: number }> {
  const result = { paid: 0, rejected: 0, pending: 0, failed: 0 };
  const rows = await prisma.trainerServiceFeeSettlement.findMany({
    where: { provider: "paymongo", status: "AWAITING_PAYMENT" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      trainerId: true,
      providerPaymentId: true,
      createdAt: true,
    },
  });
  const uninitializedCutoff = new Date(
    now.getTime() - TRAINER_SETTLEMENT_TIMEOUT_MINUTES * 60_000
  );

  for (const row of rows) {
    if (!row.providerPaymentId) {
      if (row.createdAt > uninitializedCutoff) {
        result.pending++;
        continue;
      }
      const rejected = await prisma.trainerServiceFeeSettlement.updateMany({
        where: { id: row.id, status: "AWAITING_PAYMENT" },
        data: {
          status: "REJECTED",
          reviewNote:
            "PayMongo checkout setup timed out before a payment session was created.",
        },
      });
      result.rejected += rejected.count;
      continue;
    }

    try {
      const outcome = await pollTrainerServiceFeeCheckout({
        settlementId: row.id,
        trainerId: row.trainerId,
      });
      if (outcome.status === "paid") result.paid++;
      else if (outcome.status === "failed") result.rejected++;
      else result.pending++;
    } catch (error) {
      result.failed++;
      console.error(
        "Trainer service-fee checkout reconciliation failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  return result;
}
