import "server-only";

import { cache } from "react";
import type { TransactionEnvironment } from "@prisma/client";

import { prisma } from "@/lib/db";
import { CRYPTO_PURPOSE, decrypt, encrypt, secretHint } from "@/lib/crypto";
import { appUrl } from "@/lib/urls";
import {
  PLATFORM_WEBHOOK_EVENTS,
  PLATFORM_WEBHOOK_VERSION,
  keyMode,
  registerPaymongoWebhook,
  type KeyMode,
} from "@/lib/payments/paymongo-core";

const PROVIDER = "paymongo";

export type PlatformGatewayView = {
  connected: boolean;
  source: "dashboard" | "environment";
  provider: "paymongo";
  secretKeyHint: string;
  accountLabel: string;
  mode: KeyMode | null;
  webhookConnected: boolean;
  webhookUrl: string;
  // False for a registration that predates direct QR Ph payments. It is
  // upgraded before the next charge, or by reconnecting the same key.
  webhookCurrent: boolean;
};

type PlatformGatewayCredentials = {
  secretKey: string;
  webhookSecret: string | null;
};

export function environmentForKey(secretKey: string): TransactionEnvironment {
  const mode = keyMode(secretKey);
  return mode === "live" ? "LIVE" : mode === "test" ? "TEST" : "UNKNOWN";
}

function modeForEnvironment(environment: TransactionEnvironment): KeyMode | null {
  return environment === "LIVE" ? "live" : environment === "TEST" ? "test" : null;
}

function environmentCredentials(): PlatformGatewayCredentials | null {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return {
    secretKey,
    webhookSecret: process.env.BILLING_WEBHOOK_SECRET?.trim() || null,
  };
}

// Checks can explicitly isolate themselves from a connected development
// database. Production can never bypass the dashboard row this way.
function environmentOverrideEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PLATFORM_GATEWAY_ENV_OVERRIDE === "1"
  );
}

export async function getPlatformGatewayView(): Promise<PlatformGatewayView | null> {
  const row = environmentOverrideEnabled()
    ? null
    : await prisma.platformGateway.findUnique({
        where: { provider: PROVIDER },
        select: {
          secretKeyHint: true,
          accountLabel: true,
          disconnectedAt: true,
          environment: true,
          webhookVersion: true,
        },
      });

  if (row) {
    return {
      connected: row.disconnectedAt == null,
      source: "dashboard",
      provider: PROVIDER,
      secretKeyHint: row.secretKeyHint,
      accountLabel: row.accountLabel ?? "PayMongo",
      mode: modeForEnvironment(row.environment),
      webhookConnected: row.disconnectedAt == null,
      webhookUrl: appUrl("/api/billing/webhook/paymongo"),
      webhookCurrent: row.webhookVersion >= PLATFORM_WEBHOOK_VERSION,
    };
  }

  const env = environmentCredentials();
  if (!env) return null;
  const mode = keyMode(env.secretKey);
  return {
    connected: true,
    source: "environment",
    provider: PROVIDER,
    secretKeyHint: secretHint(env.secretKey),
    accountLabel: `PayMongo (${mode ?? "unknown"} mode)`,
    mode,
    webhookConnected: Boolean(env.webhookSecret),
    webhookUrl: appUrl("/api/billing/webhook/paymongo"),
    // An environment key has no row to record an upgrade against.
    webhookCurrent: false,
  };
}

export type PlatformCollectionStatus = {
  // Whether Bunal.club's account can take a NEW player payment right now.
  ready: boolean;
  environment: TransactionEnvironment;
};

// Every automatic checkout runs through the platform account, so this is a
// global input to whether any automatic venue or trainer is bookable.
//
// Only a dashboard-connected account counts in production: its webhook can be
// upgraded and verified, which a bare environment key cannot guarantee. Checks
// opt into the environment key explicitly with PLATFORM_GATEWAY_ENV_OVERRIDE.
export const getPlatformCollectionStatus = cache(
  async (): Promise<PlatformCollectionStatus> => {
    if (environmentOverrideEnabled()) {
      const env = environmentCredentials();
      return env
        ? { ready: true, environment: environmentForKey(env.secretKey) }
        : { ready: false, environment: "UNKNOWN" };
    }

    const row = await prisma.platformGateway.findUnique({
      where: { provider: PROVIDER },
      select: { disconnectedAt: true, environment: true },
    });
    return {
      ready: row != null && row.disconnectedAt == null,
      environment: row?.environment ?? "UNKNOWN",
    };
  }
);

export async function platformGatewayConfigured(): Promise<boolean> {
  if (!environmentOverrideEnabled()) {
    const row = await prisma.platformGateway.findUnique({
      where: { provider: PROVIDER },
      select: { disconnectedAt: true },
    });
    // Once an admin has taken ownership in the dashboard, that row remains
    // authoritative. Disconnecting must not silently reactivate an old env key.
    if (row) return row.disconnectedAt == null;
  }
  return environmentCredentials() != null;
}

export async function platformWebhookUrlReachable(): Promise<boolean> {
  const url = appUrl("/api/billing/webhook/paymongo");
  if (!url.startsWith("https://")) return false;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    // The webhook only accepts POST, so 405 proves that the correct Route
    // Handler is publicly reachable without sending a fake signed event.
    return response.status === 405;
  } catch {
    return false;
  }
}

// The only platform credential decryption. Its result stays on the server and
// must never be logged, serialized into action state, or passed to a Client
// Component.
async function readPlatformCredentials(options: {
  allowDisconnected: boolean;
}): Promise<
  PlatformGatewayCredentials & { connected: boolean; webhookVersion: number | null }
> {
  if (!environmentOverrideEnabled()) {
    const row = await prisma.platformGateway.findUnique({
      where: { provider: PROVIDER },
      select: {
        secretKeyEnc: true,
        webhookSecretEnc: true,
        disconnectedAt: true,
        webhookVersion: true,
      },
    });
    if (row) {
      if (row.disconnectedAt && !options.allowDisconnected) {
        throw new Error("The admin PayMongo account is disconnected");
      }
      return {
        connected: row.disconnectedAt == null,
        webhookVersion: row.webhookVersion,
        secretKey: decrypt(
          row.secretKeyEnc,
          CRYPTO_PURPOSE.platformGatewaySecretKey
        ),
        webhookSecret: decrypt(
          row.webhookSecretEnc,
          CRYPTO_PURPOSE.platformGatewayWebhookSecret
        ),
      };
    }
  }

  const env = environmentCredentials();
  if (!env) {
    throw new Error(
      "Connect the admin PayMongo account before accepting online payments"
    );
  }
  return { ...env, connected: true, webhookVersion: null };
}

export async function loadPlatformGatewayCredentials(): Promise<PlatformGatewayCredentials> {
  const { secretKey, webhookSecret } = await readPlatformCredentials({
    allowDisconnected: false,
  });
  return { secretKey, webhookSecret };
}

// For a NEW player charge. An account connected before direct QR Ph payments
// subscribed only to hosted-checkout events; upgrade it once, before the
// charge, so closing the page cannot strand a paid intent without a webhook.
export async function loadPlatformCredentialsForCharge(): Promise<{
  secretKey: string;
}> {
  const credentials = await readPlatformCredentials({ allowDisconnected: false });
  if (
    credentials.webhookVersion != null &&
    credentials.webhookVersion < PLATFORM_WEBHOOK_VERSION
  ) {
    const webhookUrl = appUrl("/api/billing/webhook/paymongo");
    const synced = await registerPaymongoWebhook(
      credentials.secretKey,
      webhookUrl,
      credentials.webhookSecret ?? undefined,
      PLATFORM_WEBHOOK_EVENTS
    );
    if (!synced.ok) throw new Error(synced.message);

    await prisma.platformGateway.update({
      where: { provider: PROVIDER },
      data: {
        webhookSecretEnc: encrypt(
          synced.secret,
          CRYPTO_PURPOSE.platformGatewayWebhookSecret
        ),
        webhookUrl,
        webhookVersion: PLATFORM_WEBHOOK_VERSION,
      },
    });
  }
  return { secretKey: credentials.secretKey };
}

// For a payment the platform account ALREADY took: polling, cancelling,
// refunding, and verifying its webhook must keep working after an admin
// disconnects the account, exactly as a partner's stored keys do.
export async function loadPlatformCredentialsForExistingPayment(): Promise<
  PlatformGatewayCredentials & { connected: boolean }
> {
  const { secretKey, webhookSecret, connected } = await readPlatformCredentials({
    allowDisconnected: true,
  });
  return { secretKey, webhookSecret, connected };
}
