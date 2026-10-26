import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toPesos } from "@/lib/payments/paymongo-core";
import type { ProviderWebhookEvent } from "@/lib/payments/types";

// Legacy trainer service-fee settlements: only what the webhook needs to
// record an event for an old settlement. No new checkout can be started.

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
