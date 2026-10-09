import "server-only";

import { Prisma } from "@prisma/client";

import { applyVenuePaymentEvent } from "@/lib/booking-webhook";
import { prisma } from "@/lib/db";
import type { ProviderWebhookEvent } from "@/lib/payments/types";
import { applyTrainerPaymentEvent } from "@/lib/trainer-payment-settlement";

// The replay namespace for everything Bunal.club's own PayMongo account
// delivers. Service-fee settlements claim under the same name: one account has
// one event-id space, and a delivery is routed to exactly one handler.
const PLATFORM_EVENT_PROVIDER = "platform:paymongo";

// Applies a VERIFIED event about a player payment collected by the platform
// account. A court or event payment and a trainer payment can never share a
// PayMongo intent id, so the first match is the only match.
export async function handlePlatformPaymentEvent(
  event: ProviderWebhookEvent
): Promise<{ applied: boolean; reason?: string }> {
  try {
    await prisma.providerEvent.create({
      data: {
        provider: PLATFORM_EVENT_PROVIDER,
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

  // Scoped to platform-collected rows: an event signed by Bunal.club's account
  // must never settle a payment a venue's own account took.
  const booking = await applyVenuePaymentEvent(
    { providerPaymentId: event.providerPaymentId, collectedBy: "PLATFORM" },
    event
  );
  if (booking.reason !== "unknown payment") return booking;

  const trainer = await applyTrainerPaymentEvent(
    { providerPaymentId: event.providerPaymentId, collectedBy: "PLATFORM" },
    event
  );
  // "unknown payment" also covers the `payment.paid` PayMongo emits for the
  // intent behind a hosted service-fee checkout, which settles through its own
  // checkout-session event instead.
  return { applied: trainer.handled, reason: trainer.reason };
}
