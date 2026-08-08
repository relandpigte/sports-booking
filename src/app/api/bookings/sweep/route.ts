import crypto from "node:crypto";
import type { NextRequest } from "next/server";

import { expireBookingHolds } from "@/lib/booking-payments";
import { cleanupExpiredSecurityRows } from "@/lib/security-maintenance";

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

function validBearerToken(header: string, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.BOOKING_SWEEP_SECRET ?? "";
  // No secret configured means the endpoint is closed, not open.
  if (!secret) {
    return new Response("Sweep is not configured", { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!validBearerToken(auth, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [result, security] = await Promise.all([
    expireBookingHolds(),
    cleanupExpiredSecurityRows(),
  ]);
  return Response.json({ ok: true, ...result, security });
}
