import crypto from "node:crypto";
import type { NextRequest } from "next/server";

import {
  expireBookingHolds,
  reconcileInFlightBookingPayments,
} from "@/lib/booking-payments";
import { cleanupFacebookMessengerEvents } from "@/lib/facebook-messenger";
import { cleanupExpiredSecurityRows } from "@/lib/security-maintenance";
import {
  notifyPartnersOfOverdueServiceFees,
  notifyTrainersOfOverdueServiceFees,
} from "@/lib/service-fee-notifications";
import { reconcileServiceFeeCheckouts } from "@/lib/service-fee-payments";
import { cleanupStaleOpenPlaySessions } from "@/lib/open-play-maintenance";
import { createDuePayouts } from "@/lib/payouts";
import { reconcileInFlightTrainerPayments } from "@/lib/trainer-payment-settlement";
import { sendTrainerSessionReminders, sweepTrainerSessions } from "@/lib/trainers";

// Tidies up expired holds: deletes the slot rows nothing is holding any more,
// removes abandoned provisional bookings and closes out unpaid ledgers whose
// window has passed. Also the only scheduler: it reconciles payments that
// never heard back from PayMongo and batches the Monday and Thursday payouts.
//
// Vercel invokes GET hourly using CRON_SECRET. Operators may also invoke POST:
//   curl -X POST -H "Authorization: Bearer $BOOKING_SWEEP_SECRET" .../api/bookings/sweep
//
// Availability correctness never depends on this running — every read filters
// holdExpiresAt against the clock, so an expired hold stops blocking the grid
// the instant it lapses. This is hygiene.
export const dynamic = "force-dynamic";

function validBearerToken(header: string, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return (
    actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  );
}

async function runSweep(request: NextRequest) {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.BOOKING_SWEEP_SECRET?.trim(),
  ].filter((secret): secret is string => Boolean(secret));
  // No secret configured means the endpoint is closed, not open. Supporting
  // both names keeps the Vercel scheduler and manual operator calls protected.
  if (secrets.length === 0) {
    return new Response("Sweep is not configured", { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!secrets.some((secret) => validBearerToken(auth, secret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Reconcile provider payments first so a paid checkout whose webhook was
  // delayed cannot receive an incorrect overdue reminder in this same run.
  const serviceFeeCheckouts = await reconcileServiceFeeCheckouts();
  // Player payments next, before holds are reaped and before payouts are
  // batched: a payment that settles here keeps its booking and joins the run.
  const inFlightPayments = await reconcileInFlightBookingPayments();
  const inFlightTrainerPayments = await reconcileInFlightTrainerPayments();
  // The run is derived from the clock, so calling it every hour is safe: only
  // the first call after a Monday or Thursday begins in Manila creates rows.
  const payouts = await createDuePayouts();
  const [result, security, messengerEvents, serviceFeeNotifications, trainerServiceFeeNotifications, bunalQ, trainerSessions, trainerReminders] =
    await Promise.all([
      expireBookingHolds(),
      cleanupExpiredSecurityRows(),
      cleanupFacebookMessengerEvents(),
      notifyPartnersOfOverdueServiceFees(),
      notifyTrainersOfOverdueServiceFees(),
      cleanupStaleOpenPlaySessions(),
      sweepTrainerSessions(),
      sendTrainerSessionReminders(),
    ]);
  return Response.json({
    ok: true,
    ...result,
    security,
    messengerEvents,
    serviceFeeNotifications,
    trainerServiceFeeNotifications,
    serviceFeeCheckouts,
    inFlightPayments,
    inFlightTrainerPayments,
    payouts: {
      cutoffAt: payouts.cutoffAt.toISOString(),
      created: payouts.created,
      held: payouts.held,
    },
    bunalQ,
    trainerSessions,
    trainerReminders,
  });
}

export const GET = runSweep;
export const POST = runSweep;
