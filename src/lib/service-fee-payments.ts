import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toPesos } from "@/lib/payments/paymongo-core";
import type { ProviderWebhookEvent } from "@/lib/payments/types";
import {
  markTrainerServiceFeeSettlementPaid,
  rejectTrainerServiceFeeSettlement,
} from "@/lib/trainer-service-fee-payments";

// Legacy service-fee settlements. No new settlement checkout can be started:
// every automatic payment is now collected by Bunal.club itself. This only
// records a PayMongo checkout-session event for an old settlement if one ever
// arrives, so the webhook can acknowledge and deduplicate it.

async function markServiceFeeSettlementPaid(args: {
  providerPaymentId: string;
  reference: string | null;
  raw: unknown;
  amountCentavos?: number;
  feeCentavos?: number;
}): Promise<{ applied: boolean; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.serviceFeeSettlement.findUnique({
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
        await tx.serviceFeeSettlement.update({
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

    await tx.serviceFeeSettlement.update({
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

export async function handleServiceFeeProviderEvent(
  event: ProviderWebhookEvent
): Promise<{ applied: boolean; reason?: string }> {
  const provider = "platform:paymongo";
  try {
    await prisma.providerEvent.create({
      data: {
        provider,
        eventId: event.eventId,
        type: event.type,
        payload: event.raw as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { applied: false, reason: "duplicate" };
    }
    throw error;
  }

  if (event.type === "payment.succeeded") {
    const partnerResult = await markServiceFeeSettlementPaid({
      providerPaymentId: event.providerPaymentId,
      reference: event.reference,
      amountCentavos: event.amountCentavos,
      feeCentavos: event.feeCentavos,
      raw: event.raw,
    });
    if (partnerResult.reason !== "unknown settlement") return partnerResult;
    return markTrainerServiceFeeSettlementPaid({
      providerPaymentId: event.providerPaymentId,
      reference: event.reference,
      amountCentavos: event.amountCentavos,
      feeCentavos: event.feeCentavos,
      raw: event.raw,
    });
  }

  if (event.type === "payment.failed") {
    const partnerUpdated = await prisma.serviceFeeSettlement.updateMany({
      where: {
        providerPaymentId: event.providerPaymentId,
        status: "AWAITING_PAYMENT",
      },
      data: {
        status: "REJECTED",
        reviewNote:
          event.failureMessage ?? "The PayMongo payment failed.",
        raw: event.raw as Prisma.InputJsonValue,
      },
    });
    const trainerUpdated = await rejectTrainerServiceFeeSettlement(event);
    const applied = partnerUpdated.count + trainerUpdated === 1;
    return {
      applied,
      reason: applied ? undefined : "unknown settlement",
    };
  }

  return { applied: false, reason: "ignored event" };
}
