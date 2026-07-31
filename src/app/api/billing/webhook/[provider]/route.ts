import type { NextRequest } from "next/server";

import { verifyPlatformPaymongoWebhook } from "@/lib/payments/paymongo-platform";
import { handleServiceFeeProviderEvent } from "@/lib/service-fee-payments";

// Signed callbacks from Bunal.club's own PayMongo account for partner-to-admin
// service-fee settlements. The legacy /billing path is kept because existing
// PayMongo webhook registrations already point here.
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  if (provider !== "paymongo") {
    return new Response("Unknown provider", { status: 404 });
  }

  // Signature verification is byte-exact.
  const rawBody = await request.text();
  const event = await verifyPlatformPaymongoWebhook(rawBody, request.headers);
  if (!event) return new Response("Invalid signature", { status: 400 });

  const result = await handleServiceFeeProviderEvent(event);
  return Response.json({ ok: true, ...result });
}
