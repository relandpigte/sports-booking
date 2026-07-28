import type { NextRequest } from "next/server";

import { sweepDueSubscriptions } from "@/lib/billing";

// Advances every subscription whose deadline has passed: ends trials, pulls
// card renewals, and moves lapsed partners through grace.
//
// Point a cron at this in production:
//   curl -X POST -H "Authorization: Bearer $BILLING_SWEEP_SECRET" .../api/billing/sweep
//
// Listing correctness never depends on this running — the entitlement
// predicate is time-based. This only pulls CHARGES forward.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.BILLING_SWEEP_SECRET ?? "";
  // No secret configured means the endpoint is closed, not open.
  if (!secret) {
    return new Response("Sweep is not configured", { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sweepDueSubscriptions({ limit: 100 });
  return Response.json({ ok: true, ...result });
}
