import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { handleTrainerPaymentEvent } from "@/lib/trainer-payment-actions";
import { loadTrainerGatewayCredentials } from "@/lib/trainer-gateway";
import { getVenueGateway } from "@/lib/payments/venue";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const gateway = await prisma.trainerGateway.findUnique({
    where: { webhookToken: token },
    select: { id: true },
  });
  if (!gateway) return new Response("Unknown endpoint", { status: 404 });
  const rawBody = await request.text();
  const credentials = await loadTrainerGatewayCredentials(gateway.id);
  const event = await getVenueGateway(credentials).verifyWebhook(
    rawBody,
    request.headers
  );
  if (!event) return new Response("Invalid signature", { status: 400 });
  const result = await handleTrainerPaymentEvent({ gatewayId: gateway.id, webhookToken: token, event });
  return Response.json({ ok: true, ...result });
}
