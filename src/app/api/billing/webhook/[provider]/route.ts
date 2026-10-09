import type { NextRequest } from "next/server";

import { readPlatformPaymongoWebhook } from "@/lib/payments/paymongo-platform";
import { handlePlatformPaymentEvent } from "@/lib/platform-webhook";
import { handleServiceFeeProviderEvent } from "@/lib/service-fee-payments";

// Signed callbacks from Bunal.club's own PayMongo account: player payments it
// collects for venues and trainers, and partner/trainer service-fee
// settlements. The legacy /billing path is kept because existing PayMongo
// webhook registrations already point here.
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
  const delivery = await readPlatformPaymongoWebhook(rawBody, request.headers);
  if (delivery.kind === "invalid") {
    return new Response("Invalid signature", { status: 400 });
  }
  // A signed event this app has nothing to do with is still a success from
  // PayMongo's point of view — an error would make it retry forever.
  if (delivery.kind === "ignored") {
    return Response.json({ ok: true, applied: false, reason: "ignored event" });
  }

  const result =
    delivery.kind === "settlement"
      ? await handleServiceFeeProviderEvent(delivery.event)
      : await handlePlatformPaymentEvent(delivery.event);
  return Response.json({ ok: true, ...result });
}
