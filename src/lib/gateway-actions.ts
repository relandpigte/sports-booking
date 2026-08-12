"use server";

import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { requireActivePartner, requireRecentMfa } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import { ConnectGatewaySchema } from "@/lib/validation";
import {
  CRYPTO_PURPOSE,
  encrypt,
  isEncryptionConfigured,
  secretHint,
} from "@/lib/crypto";
import { getVenueGateway, type VenueGatewayId } from "@/lib/payments/venue";
import {
  PAYMONGO_WEBHOOK_VERSION,
  VENUE_WEBHOOK_EVENTS,
  registerPaymongoWebhook,
} from "@/lib/payments/paymongo-venue";
import { appUrl } from "@/lib/urls";
import { recordImpersonatedAction } from "@/lib/impersonation";
import { revalidatePartnerPaymentSurfaces } from "@/lib/payment-revalidation";

// Deliberately NO `values` field: unlike a hub form, a gateway form's contents
// must never round-trip through rendered state.
export type GatewayFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  // Set when automatic webhook registration failed and the partner needs to
  // paste the signing secret themselves. The form reveals that field only in
  // response to this — it isn't something to ask for up front.
  needsWebhookSecret?: boolean;
};

export async function connectGatewayAction(
  _prev: GatewayFormState,
  formData: FormData
): Promise<GatewayFormState> {
  const partner = await requireActivePartner();
  await requireRecentMfa("/dashboard/payments");

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

  const provider = parsed.data.provider as VenueGatewayId;

  // The token is minted BEFORE anything is verified now, because the webhook
  // URL it forms has to be registered with the gateway first. Reconnecting
  // keeps the existing one, so a partner's URL never changes under them.
  const existing = await prisma.partnerGateway.findUnique({
    where: { userId: partner.id },
    select: { webhookToken: true },
  });
  // Random, not the user id — this ends up in a third party's dashboard.
  const webhookToken =
    existing?.webhookToken ?? crypto.randomBytes(24).toString("base64url");

  const creds = {
    provider,
    publicKey: parsed.data.publicKey,
    secretKey: parsed.data.secretKey,
    // Verification doesn't need the webhook secret; registration produces it.
    webhookSecret: parsed.data.webhookSecret ?? "",
  };

  // Verify BEFORE storing, so a typo fails here rather than silently failing a
  // player's first payment.
  const check = await getVenueGateway(creds).verifyCredentials();
  if (!check.ok) return { errors: { secretKey: check.message } };

  // Then the webhook. Without one, a payment would never settle — so if this
  // can't be arranged, NOTHING is stored. Connected-but-deaf is the one state
  // a partner must never be left in.
  let webhookSecret = parsed.data.webhookSecret;
  if (provider === "paymongo") {
    const registered = await registerPaymongoWebhook(
      creds.secretKey,
      appUrl(`/api/venue-payments/webhook/${webhookToken}`),
      webhookSecret,
      VENUE_WEBHOOK_EVENTS
    );
    if (!registered.ok) {
      return { message: registered.message, needsWebhookSecret: true };
    }
    webhookSecret = registered.secret;
  }
  if (!webhookSecret) {
    return {
      errors: { webhookSecret: "Paste your webhook signing secret" },
      needsWebhookSecret: true,
    };
  }

  const secretKeyEnc = encrypt(creds.secretKey, CRYPTO_PURPOSE.gatewaySecretKey);
  const webhookSecretEnc = encrypt(
    webhookSecret,
    CRYPTO_PURPOSE.gatewayWebhookSecret
  );

  const gateway = await prisma.partnerGateway.upsert({
    where: { userId: partner.id },
    create: {
      userId: partner.id,
      provider: creds.provider,
      publicKey: creds.publicKey,
      secretKeyEnc,
      webhookSecretEnc,
      secretKeyHint: secretHint(creds.secretKey),
      webhookToken,
      webhookVersion: PAYMONGO_WEBHOOK_VERSION,
      accountLabel: check.accountLabel,
    },
    update: {
      provider: creds.provider,
      publicKey: creds.publicKey,
      secretKeyEnc,
      webhookSecretEnc,
      secretKeyHint: secretHint(creds.secretKey),
      accountLabel: check.accountLabel,
      webhookVersion: PAYMONGO_WEBHOOK_VERSION,
      // Reconnecting re-enables; the webhook token is intentionally kept so a
      // partner doesn't have to re-paste the URL.
      disconnectedAt: null,
    },
    select: { id: true },
  });

  await revalidatePartnerPaymentSurfaces(partner.id);
  await recordImpersonatedAction({
    action: "PAYMENT_GATEWAY_CONNECTED",
    targetType: "PartnerGateway",
    targetId: gateway.id,
    metadata: { provider, accountLabel: check.accountLabel },
  });
  return {
    success: parsed.data.webhookSecret
      ? "Connected. Booking subtotals are deposited into your PayMongo account; remit Bunal.club service fees from Payments."
      : "Connected, and we've registered the webhook in your PayMongo account. Booking subtotals are deposited to you; remit Bunal.club service fees from Payments.",
  };
}

export async function disconnectGatewayAction(
  _prev: GatewayFormState,
  _formData: FormData
): Promise<GatewayFormState> {
  // Active partners can turn off taking money at any time.
  const partner = await requireActivePartner();
  await requireRecentMfa("/dashboard/payments");

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

  await revalidatePartnerPaymentSurfaces(partner.id);
  await recordImpersonatedAction({
    action: "PAYMENT_GATEWAY_DISCONNECTED",
    targetType: "PartnerGateway",
    targetId: existing.id,
  });
  return {
    success:
      "Disconnected. Complete hubs remain public as Coming soon, but new online bookings are paused until you reconnect. Refunds on existing paid bookings still work.",
  };
}
