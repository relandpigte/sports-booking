import "server-only";

import { prisma } from "@/lib/db";
import { CRYPTO_PURPOSE, decrypt, secretHint } from "@/lib/crypto";
import { appUrl } from "@/lib/urls";
import { keyMode, type KeyMode } from "@/lib/payments/paymongo-core";

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
};

type PlatformGatewayCredentials = {
  secretKey: string;
  webhookSecret: string | null;
};

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
        },
      });

  if (row) {
    return {
      connected: row.disconnectedAt == null,
      source: "dashboard",
      provider: PROVIDER,
      secretKeyHint: row.secretKeyHint,
      accountLabel: row.accountLabel ?? "PayMongo",
      mode: row.accountLabel?.includes("(live mode)")
        ? "live"
        : row.accountLabel?.includes("(test mode)")
          ? "test"
          : null,
      webhookConnected: row.disconnectedAt == null,
      webhookUrl: appUrl("/api/billing/webhook/paymongo"),
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
  };
}

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

// The only platform credential loader. Its result stays on the server and must
// never be logged, serialized into action state, or passed to a Client Component.
export async function loadPlatformGatewayCredentials(): Promise<PlatformGatewayCredentials> {
  if (!environmentOverrideEnabled()) {
    const row = await prisma.platformGateway.findUnique({
      where: { provider: PROVIDER },
      select: {
        secretKeyEnc: true,
        webhookSecretEnc: true,
        disconnectedAt: true,
      },
    });
    if (row) {
      if (row.disconnectedAt) {
        throw new Error("The admin PayMongo account is disconnected");
      }
      return {
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
      "Connect the admin PayMongo account before accepting service-fee settlements"
    );
  }
  return env;
}
