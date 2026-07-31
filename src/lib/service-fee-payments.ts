import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  createServiceFeeCheckout,
  getServiceFeeCheckout,
} from "@/lib/payments/paymongo-platform";
import { PayMongoRequestError, paidPayment, toPesos } from "@/lib/payments/paymongo-core";
import type { ProviderWebhookEvent } from "@/lib/payments/types";
import { calculateServiceFeeBalance } from "@/lib/service-fees";

export type ServiceFeeCheckoutResult =
  | { status: "redirect"; url: string }
  | { status: "paid" }
  | { status: "none" }
  | { status: "pending" }
  | { status: "failed"; message: string };

export async function startServiceFeeCheckout(args: {
  partnerId: string;
  partnerName: string;
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
        const existing = await tx.serviceFeeSettlement.findFirst({
          where: {
            partnerId: args.partnerId,
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

        const balance = await calculateServiceFeeBalance(tx, args.partnerId);
        if (balance.amountDue < 0.01) {
          throw new NoServiceFeeBalanceError();
        }

        return tx.serviceFeeSettlement.create({
          data: {
            partnerId: args.partnerId,
            periodStart: balance.oldestEntryAt ?? new Date(),
            periodEnd: new Date(),
            amount: new Prisma.Decimal(balance.amountDue),
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
    if (error instanceof NoServiceFeeBalanceError) return { status: "none" };
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
    const checkout = await createServiceFeeCheckout({
      settlementId: settlement.id,
      partnerId: args.partnerId,
      partnerName: args.partnerName,
      amount: Number(settlement.amount),
    });
    await prisma.serviceFeeSettlement.update({
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
      // Validation failures will not recover with the same checkout. Network
      // failures keep the row retryable with the same PayMongo idempotency key.
      if (error.status > 0) {
        await prisma.serviceFeeSettlement.updateMany({
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

class NoServiceFeeBalanceError extends Error {}

async function markServiceFeeSettlementPaid(args: {
  providerPaymentId: string;
  reference: string | null;
  raw: unknown;
  amountCentavos?: number;
}): Promise<{ applied: boolean; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.serviceFeeSettlement.findUnique({
      where: { providerPaymentId: args.providerPaymentId },
      select: { id: true, status: true, amount: true },
    });
    if (!settlement) return { applied: false, reason: "unknown settlement" };
    if (settlement.status === "PAID") {
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
        reviewedAt: new Date(),
        reviewNote: "Paid automatically through PayMongo.",
        raw: args.raw as Prisma.InputJsonValue,
      },
    });
    return { applied: true };
  });
}

export async function pollServiceFeeCheckout(args: {
  settlementId: string;
  partnerId: string;
}): Promise<ServiceFeeCheckoutResult> {
  const settlement = await prisma.serviceFeeSettlement.findFirst({
    where: {
      id: args.settlementId,
      partnerId: args.partnerId,
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
      await markServiceFeeSettlementPaid({
        providerPaymentId: settlement.providerPaymentId,
        reference: paid.id,
        amountCentavos: paid.attributes?.amount,
        raw: session,
      });
      return { status: "paid" };
    }
    if (session.status === "expired") {
      await prisma.serviceFeeSettlement.updateMany({
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
    if (error instanceof PayMongoRequestError) {
      return { status: "pending" };
    }
    throw error;
  }
}

export async function pollLatestServiceFeeCheckout(
  partnerId: string
): Promise<ServiceFeeCheckoutResult> {
  const latest = await prisma.serviceFeeSettlement.findFirst({
    where: {
      partnerId,
      status: "AWAITING_PAYMENT",
      provider: "paymongo",
      providerPaymentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { status: "none" };
  return pollServiceFeeCheckout({
    settlementId: latest.id,
    partnerId,
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
    return markServiceFeeSettlementPaid({
      providerPaymentId: event.providerPaymentId,
      reference: event.reference,
      amountCentavos: event.amountCentavos,
      raw: event.raw,
    });
  }

  if (event.type === "payment.failed") {
    const updated = await prisma.serviceFeeSettlement.updateMany({
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
    return {
      applied: updated.count === 1,
      reason: updated.count === 1 ? undefined : "unknown settlement",
    };
  }

  return { applied: false, reason: "ignored event" };
}
