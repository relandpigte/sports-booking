import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { loadGatewayCredentials } from "@/lib/partner-gateway";
import { getVenueGateway } from "@/lib/payments/venue";
import { handleVenueEvent } from "@/lib/booking-webhook";

// Callbacks from a partner's own gateway for player booking payments.
//
// Unauthenticated by necessity: a gateway has no session. The token identifies
// which partner is being paid; the SIGNATURE is the authorization. Nothing
// here trusts the body until verifyWebhook has confirmed it against that
// partner's own webhook secret.
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  // Next 16: params is a Promise.
  const { token } = await ctx.params;

  // Deliberately NOT filtered on disconnectedAt: a payment taken before the
  // partner disconnected must still be able to settle.
  const gateway = await prisma.partnerGateway.findUnique({
    where: { webhookToken: token },
    select: { id: true },
  });
  if (!gateway) return new Response("Unknown endpoint", { status: 404 });

  // Signature verification is byte-exact, so read the RAW body — parsing first
  // would re-serialize it and change the bytes.
  const rawBody = await request.text();

  const creds = await loadGatewayCredentials(gateway.id);
  const event = await getVenueGateway(creds).verifyWebhook(
    rawBody,
    request.headers
  );
  if (!event) return new Response("Invalid signature", { status: 400 });

  const result = await handleVenueEvent({ gatewayId: gateway.id, event });

  // A duplicate delivery is a success from the gateway's point of view —
  // returning an error would make it retry forever.
  return Response.json({ ok: true, ...result });
}
