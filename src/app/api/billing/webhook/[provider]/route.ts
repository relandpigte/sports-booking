import type { NextRequest } from "next/server";

import { getPaymentProvider } from "@/lib/payments";
import { handleProviderEvent } from "@/lib/billing-webhook";

// Payment gateway callbacks. Unauthenticated by necessity — the gateway has no
// session — so the SIGNATURE is the authorization. Nothing here trusts the body
// until verifyWebhook has confirmed it.
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  // Next 16: params is a Promise.
  const { provider: providerId } = await ctx.params;

  const provider = getPaymentProvider();
  if (providerId !== provider.id) {
    return new Response("Unknown provider", { status: 404 });
  }

  // Signature verification is byte-exact, so read the RAW body — parsing first
  // would re-serialize it and change the bytes.
  const rawBody = await request.text();

  const event = await provider.verifyWebhook(rawBody, request.headers);
  if (!event) {
    return new Response("Invalid signature", { status: 400 });
  }

  const result = await handleProviderEvent(providerId, event);

  // A duplicate delivery is a success from the gateway's point of view —
  // returning an error would make it retry forever.
  return Response.json({ ok: true, ...result });
}
