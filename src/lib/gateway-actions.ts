"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/dal";
import { partnerBillingGate } from "@/lib/billing";
import { firstErrors } from "@/lib/zod-errors";
import { ConnectGatewaySchema } from "@/lib/validation";
import {
  CRYPTO_PURPOSE,
  encrypt,
  isEncryptionConfigured,
  secretHint,
} from "@/lib/crypto";
import { getVenueGateway, type VenueGatewayId } from "@/lib/payments/venue";

// Deliberately NO `values` field: unlike a hub form, a gateway form's contents
// must never round-trip through rendered state. Same rule as CardSchema.
export type GatewayFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

async function revalidateGatewaySurfaces(partnerId: string) {
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/hubs");
  revalidatePath("/hubs");
  const hubs = await prisma.hub.findMany({
    where: { ownerId: partnerId },
    select: { id: true },
  });
  for (const hub of hubs) revalidatePath(`/hubs/${hub.id}`);
}

export async function connectGatewayAction(
  _prev: GatewayFormState,
  formData: FormData
): Promise<GatewayFormState> {
  // Gated like updateHubAction — a lapsed partner isn't configuring payouts.
  const gate = await partnerBillingGate();
  if (!gate.ok) return { message: gate.message };
  const partner = gate.partner;

  // Refuse rather than ever storing a secret in plaintext.
  if (!isEncryptionConfigured()) {
    return {
      message:
        "Payments aren't configured on this server yet (ENCRYPTION_KEY is missing). Contact support.",
    };
  }

  const parsed = ConnectGatewaySchema.safeParse({
    provider: String(formData.get("provider") ?? ""),
    publicKey: String(formData.get("publicKey") ?? ""),
    secretKey: String(formData.get("secretKey") ?? ""),
    webhookSecret: String(formData.get("webhookSecret") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const creds = {
    provider: parsed.data.provider as VenueGatewayId,
    publicKey: parsed.data.publicKey,
    secretKey: parsed.data.secretKey,
    webhookSecret: parsed.data.webhookSecret,
  };

  // Verify BEFORE storing, so a typo fails here rather than silently failing a
  // player's first payment.
  const check = await getVenueGateway(creds).verifyCredentials();
  if (!check.ok) return { errors: { secretKey: check.message } };

  const secretKeyEnc = encrypt(creds.secretKey, CRYPTO_PURPOSE.gatewaySecretKey);
  const webhookSecretEnc = encrypt(
    creds.webhookSecret,
    CRYPTO_PURPOSE.gatewayWebhookSecret
  );

  await prisma.partnerGateway.upsert({
    where: { userId: partner.id },
    create: {
      userId: partner.id,
      provider: creds.provider,
      publicKey: creds.publicKey,
      secretKeyEnc,
      webhookSecretEnc,
      secretKeyHint: secretHint(creds.secretKey),
      // Random, not the user id — this ends up in a third party's dashboard.
      webhookToken: crypto.randomBytes(24).toString("base64url"),
      accountLabel: check.accountLabel,
    },
    update: {
      provider: creds.provider,
      publicKey: creds.publicKey,
      secretKeyEnc,
      webhookSecretEnc,
      secretKeyHint: secretHint(creds.secretKey),
      accountLabel: check.accountLabel,
      // Reconnecting re-enables; the webhook token is intentionally kept so a
      // partner doesn't have to re-paste the URL.
      disconnectedAt: null,
    },
  });

  await revalidateGatewaySurfaces(partner.id);
  return {
    success:
      "Connected. Players now pay online to confirm a booking, and the money goes straight to you.",
  };
}

export async function disconnectGatewayAction(
  _prev: GatewayFormState,
  _formData: FormData
): Promise<GatewayFormState> {
  // Never gated behind the subscription — you can always turn off taking money.
  const partner = await requirePartner();

  const existing = await prisma.partnerGateway.findUnique({
    where: { userId: partner.id },
    select: { id: true },
  });
  if (!existing) return { message: "No gateway is connected." };

  // Keeps the ciphertext on purpose, so refunds on already-paid bookings still
  // work. Live holds are left alone — those players are mid-checkout and their
  // payment should still settle.
  await prisma.partnerGateway.update({
    where: { userId: partner.id },
    data: { disconnectedAt: new Date() },
  });

  await revalidateGatewaySurfaces(partner.id);
  return {
    success:
      "Disconnected. New bookings confirm instantly again and are settled at the venue. Refunds on existing paid bookings still work.",
  };
}
