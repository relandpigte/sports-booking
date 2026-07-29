import type { NextRequest } from "next/server";

import { expireBookingHolds } from "@/lib/booking-payments";

// Tidies up expired holds: deletes the slot rows nothing is holding any more,
// flips PENDING bookings to EXPIRED, and closes out payments whose window has
// passed.
//
// Point a cron at this in production:
//   curl -X POST -H "Authorization: Bearer $BOOKING_SWEEP_SECRET" .../api/bookings/sweep
//
// Availability correctness never depends on this running — every read filters
// holdExpiresAt against the clock, so an expired hold stops blocking the grid
// the instant it lapses. This is hygiene.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.BOOKING_SWEEP_SECRET ?? "";
  // No secret configured means the endpoint is closed, not open.
  if (!secret) {
    return new Response("Sweep is not configured", { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await expireBookingHolds();
  return Response.json({ ok: true, ...result });
}
