import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { applySuccessfulPayment } from "@/lib/billing";
import type { ProviderWebhookEvent } from "@/lib/payments";

// Applies a verified gateway event to the ledger.
//
// Shared by the webhook route and the local stub checkout so both take the
// identical path — the stub isn't a shortcut around the real logic.
//
// Idempotent twice over: ProviderEvent's unique (provider, eventId) absorbs a
// replayed delivery, and applySuccessfulPayment is a no-op for a period already
// covered.
export async function handleProviderEvent(
  provider: string,
  event: ProviderWebhookEvent,
  // The stub knows the payment directly; a real webhook has to look it up by
  // the gateway's own payment id.
  knownPaymentId?: string
): Promise<{ applied: boolean; reason?: string }> {
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
      // Already processed — gateways retry deliveries.
      return { applied: false, reason: "duplicate" };
    }
    throw error;
  }

  const payment = knownPaymentId
    ? await prisma.payment.findUnique({ where: { id: knownPaymentId } })
    : await prisma.payment.findFirst({
        where: { providerPaymentId: event.providerPaymentId },
        orderBy: { createdAt: "desc" },
      });

  if (!payment) return { applied: false, reason: "unknown payment" };
  if (payment.status !== "PENDING") {
    return { applied: false, reason: "already settled" };
  }

  if (event.type === "payment.succeeded") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        providerPaymentId: event.providerPaymentId,
        providerRef: event.reference,
        paidAt: new Date(),
        raw: event.raw as Prisma.InputJsonValue,
      },
    });
    await applySuccessfulPayment(payment.id);
    return { applied: true };
  }

  if (event.type === "payment.failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        providerPaymentId: event.providerPaymentId,
        failureCode: event.failureCode,
        failureMessage: event.failureMessage,
        raw: event.raw as Prisma.InputJsonValue,
      },
    });
    return { applied: true };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "REFUNDED",
      refundedAt: new Date(),
      raw: event.raw as Prisma.InputJsonValue,
    },
  });
  return { applied: true };
}
