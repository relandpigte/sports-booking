import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { CRYPTO_PURPOSE, decrypt, encrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/urls";
import type { GatewayCredentials, VenueGatewayId } from "@/lib/payments/venue";
import {
  PAYMONGO_WEBHOOK_VERSION,
  VENUE_WEBHOOK_EVENTS,
  registerPaymongoWebhook,
} from "@/lib/payments/paymongo-core";

// What the UI is ALLOWED to see. Note what's absent: no secret key, no webhook
// secret, no ciphertext. The hint is stored in plaintext precisely so rendering
// the connected state never needs a key in memory.
export type GatewayView = {
  connected: boolean;
  provider: VenueGatewayId;
  publicKey: string;
  secretKeyHint: string;
  accountLabel: string | null;
  connectedAt: Date;
  // The partner pastes this into their gateway's dashboard.
  webhookUrl: string;
};

// Is this partner able to take money right now? Memoized per render, like
// getCourtForBooking, because the booking flow asks on every submit.
// Selects no ciphertext.
export const getActivePartnerGateway = cache(
  async (
    partnerId: string
  ): Promise<{ id: string; provider: VenueGatewayId } | null> => {
    const row = await prisma.partnerGateway.findFirst({
      where: { userId: partnerId, disconnectedAt: null },
      select: { id: true, provider: true },
    });
    return row ? { id: row.id, provider: row.provider as VenueGatewayId } : null;
  }
);

export async function getGatewayView(
  partnerId: string
): Promise<GatewayView | null> {
  const row = await prisma.partnerGateway.findUnique({
    where: { userId: partnerId },
    select: {
      provider: true,
      publicKey: true,
      secretKeyHint: true,
      accountLabel: true,
      connectedAt: true,
      disconnectedAt: true,
      webhookToken: true,
    },
  });
  if (!row) return null;
  return {
    connected: row.disconnectedAt == null,
    provider: row.provider as VenueGatewayId,
    publicKey: row.publicKey,
    secretKeyHint: row.secretKeyHint,
    accountLabel: row.accountLabel,
    connectedAt: row.connectedAt,
    webhookUrl: appUrl(`/api/venue-payments/webhook/${row.webhookToken}`),
  };
}

// The ONLY function that decrypts. Server-only; its result must never cross the
// RSC boundary, be logged, or end up in an error message.
export async function loadGatewayCredentials(
  gatewayId: string
): Promise<GatewayCredentials> {
  const row = await prisma.partnerGateway.findUnique({
    where: { id: gatewayId },
    select: {
      provider: true,
      publicKey: true,
      secretKeyEnc: true,
      webhookSecretEnc: true,
    },
  });
  if (!row) throw new Error("Gateway not found");

  return {
    provider: row.provider as VenueGatewayId,
    publicKey: row.publicKey,
    secretKey: decrypt(row.secretKeyEnc, CRYPTO_PURPOSE.gatewaySecretKey),
    webhookSecret: decrypt(
      row.webhookSecretEnc,
      CRYPTO_PURPOSE.gatewayWebhookSecret
    ),
  };
}

export async function loadGatewayCredentialsForCharge(
  gatewayId: string
): Promise<GatewayCredentials> {
  const credentials = await loadGatewayCredentials(gatewayId);
  const row = await prisma.partnerGateway.findUnique({
    where: { id: gatewayId },
    select: { webhookToken: true, webhookVersion: true },
  });
  if (!row) throw new Error("Gateway not found");

  // Existing connected accounts initially subscribed only to hosted Checkout
  // events. Upgrade each one once, before its next charge, so closing the page
  // cannot strand a successful direct Payment Intent without a webhook.
  if (
    credentials.provider === "paymongo" &&
    row.webhookVersion < PAYMONGO_WEBHOOK_VERSION
  ) {
    const synced = await registerPaymongoWebhook(
      credentials.secretKey,
      appUrl(`/api/venue-payments/webhook/${row.webhookToken}`),
      credentials.webhookSecret,
      VENUE_WEBHOOK_EVENTS
    );
    if (!synced.ok) throw new Error(synced.message);

    credentials.webhookSecret = synced.secret;
    await prisma.partnerGateway.update({
      where: { id: gatewayId },
      data: {
        webhookSecretEnc: encrypt(
          synced.secret,
          CRYPTO_PURPOSE.gatewayWebhookSecret
        ),
        webhookVersion: PAYMONGO_WEBHOOK_VERSION,
      },
    });
  }

  return credentials;
}
