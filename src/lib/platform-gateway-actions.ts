"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import {
  CRYPTO_PURPOSE,
  decrypt,
  encrypt,
  isEncryptionConfigured,
  secretHint,
} from "@/lib/crypto";
import { prisma } from "@/lib/db";
import {
  environmentForKey,
  platformWebhookUrlReachable,
} from "@/lib/platform-gateway";
import {
  PLATFORM_WEBHOOK_EVENTS,
  PLATFORM_WEBHOOK_VERSION,
  PayMongoRequestError,
  getCheckoutSession,
  getPaymentIntent,
  keyMode,
  paymongoRequest,
  registerPaymongoWebhook,
} from "@/lib/payments/paymongo-core";
import { reconcileServiceFeeCheckouts } from "@/lib/service-fee-payments";
import { appUrl } from "@/lib/urls";
import { ConnectPlatformGatewaySchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";
import { requireRecentMfa } from "@/lib/dal";

export type PlatformGatewayFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  needsWebhookSecret?: boolean;
};

function revalidatePlatformGatewaySurfaces() {
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/payments");
  revalidatePath("/dashboard/payments");
  // Every automatic venue and trainer becomes bookable or unbookable with
  // this account, so the public directories change too.
  revalidatePath("/", "layout");
}

// Player payments this account is still expected to settle. A row past its
// own expiry can no longer be paid, so it never blocks an account change.
function inFlightPlatformPayments() {
  const where = {
    collectedBy: "PLATFORM" as const,
    status: "PENDING" as const,
    providerPaymentId: { not: null },
    expiresAt: { gt: new Date() },
  };
  return Promise.all([
    prisma.bookingPayment.findMany({
      where,
      select: { providerPaymentId: true },
    }),
    prisma.trainerPayment.findMany({
      where,
      select: { providerPaymentId: true },
    }),
  ]).then(([bookings, trainers]) => [...bookings, ...trainers]);
}

async function keyCanReadActiveCheckouts(secretKey: string): Promise<boolean> {
  const active = await prisma.serviceFeeSettlement.findMany({
    where: {
      provider: "paymongo",
      status: "AWAITING_PAYMENT",
      providerPaymentId: { not: null },
    },
    select: { providerPaymentId: true },
  });

  try {
    for (const settlement of active) {
      await getCheckoutSession(secretKey, settlement.providerPaymentId!);
    }
    return true;
  } catch {
    return false;
  }
}

// A replacement key from a different PayMongo account would strand money this
// account already holds: in-flight payments could not settle, and completed
// ones could not be refunded. The newest completed payment in the same key
// mode stands in for the rest, since every one came from the same account.
async function keyCanReadPlatformPayments(secretKey: string): Promise<boolean> {
  const environment = environmentForKey(secretKey);
  const completed = {
    collectedBy: "PLATFORM" as const,
    status: "SUCCEEDED" as const,
    providerPaymentId: { startsWith: "pi_" },
  };
  const [inFlight, lastBooking, lastTrainer] = await Promise.all([
    inFlightPlatformPayments(),
    prisma.bookingPayment.findFirst({
      where: { ...completed, environment },
      orderBy: { paidAt: "desc" },
      select: { providerPaymentId: true },
    }),
    // Trainer payments carry no environment snapshot. A live key is checked
    // against the newest one; a test key is not, so sandbox setup stays open.
    environment === "LIVE"
      ? prisma.trainerPayment.findFirst({
          where: completed,
          orderBy: { paidAt: "desc" },
          select: { providerPaymentId: true },
        })
      : null,
  ]);

  try {
    for (const payment of [...inFlight, lastBooking, lastTrainer]) {
      if (!payment?.providerPaymentId?.startsWith("pi_")) continue;
      await getPaymentIntent(secretKey, payment.providerPaymentId);
    }
    return true;
  } catch {
    return false;
  }
}

async function existingWebhookSecretForSameKey(
  secretKey: string
): Promise<string | null> {
  const row = await prisma.platformGateway.findUnique({
    where: { provider: "paymongo" },
    select: {
      secretKeyEnc: true,
      webhookSecretEnc: true,
      webhookUrl: true,
    },
  });
  if (row) {
    try {
      const existingKey = decrypt(
        row.secretKeyEnc,
        CRYPTO_PURPOSE.platformGatewaySecretKey
      );
      return existingKey === secretKey &&
        row.webhookUrl === appUrl("/api/billing/webhook/paymongo")
        ? decrypt(
            row.webhookSecretEnc,
            CRYPTO_PURPOSE.platformGatewayWebhookSecret
          )
        : null;
    } catch {
      // A replacement key can repair a row encrypted with a retired master
      // key; automatic webhook registration will provide a fresh secret.
      return null;
    }
  }

  return process.env.PAYMONGO_SECRET_KEY?.trim() === secretKey
    ? process.env.BILLING_WEBHOOK_SECRET?.trim() || null
    : null;
}

export async function connectPlatformGatewayAction(
  _prev: PlatformGatewayFormState,
  formData: FormData
): Promise<PlatformGatewayFormState> {
  const admin = await requireAdmin();
  await requireRecentMfa("/dashboard/admin/payments");

  if (!isEncryptionConfigured()) {
    return {
      message:
        "Payments cannot be connected until ENCRYPTION_KEY is configured on this server.",
    };
  }

  const parsed = ConnectPlatformGatewaySchema.safeParse({
    secretKey: String(formData.get("secretKey") ?? ""),
    webhookSecret: String(formData.get("webhookSecret") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const mode = keyMode(parsed.data.secretKey);
  try {
    await paymongoRequest(parsed.data.secretKey, "GET", "/webhooks");
  } catch (error) {
    return {
      errors: {
        secretKey:
          error instanceof PayMongoRequestError && error.status === 401
            ? "PayMongo rejected that secret key."
            : error instanceof Error
              ? error.message
              : "We could not verify that PayMongo key.",
      },
    };
  }

  if (!(await keyCanReadActiveCheckouts(parsed.data.secretKey))) {
    return {
      errors: {
        secretKey:
          "An active settlement belongs to a different PayMongo account. Finish it before replacing the account.",
      },
    };
  }

  if (!(await keyCanReadPlatformPayments(parsed.data.secretKey))) {
    return {
      errors: {
        secretKey:
          "Player payments already collected belong to a different PayMongo account. Reconnect that account so they can still settle and be refunded.",
      },
    };
  }

  if (!(await platformWebhookUrlReachable())) {
    return {
      message:
        "APP_URL does not currently reach this app's public payment webhook. Point it to the live HTTPS site, restart the app, then connect again.",
    };
  }

  // Always registered, even when a signing secret is already on file: this is
  // what subscribes an older connection to the events direct QR Ph needs. An
  // existing endpoint is updated in place and keeps its secret.
  const webhookUrl = appUrl("/api/billing/webhook/paymongo");
  const knownSecret =
    parsed.data.webhookSecret ??
    (await existingWebhookSecretForSameKey(parsed.data.secretKey)) ??
    undefined;
  const registered = await registerPaymongoWebhook(
    parsed.data.secretKey,
    webhookUrl,
    knownSecret,
    PLATFORM_WEBHOOK_EVENTS
  );
  if (!registered.ok) {
    return { message: registered.message, needsWebhookSecret: true };
  }
  const webhookSecret = registered.secret;
  const environment = environmentForKey(parsed.data.secretKey);

  await prisma.platformGateway.upsert({
    where: { provider: "paymongo" },
    create: {
      provider: "paymongo",
      secretKeyEnc: encrypt(
        parsed.data.secretKey,
        CRYPTO_PURPOSE.platformGatewaySecretKey
      ),
      webhookSecretEnc: encrypt(
        webhookSecret,
        CRYPTO_PURPOSE.platformGatewayWebhookSecret
      ),
      secretKeyHint: secretHint(parsed.data.secretKey),
      webhookUrl,
      webhookVersion: PLATFORM_WEBHOOK_VERSION,
      environment,
      accountLabel: `PayMongo (${mode ?? "unknown"} mode)`,
      connectedById: admin.id,
    },
    update: {
      secretKeyEnc: encrypt(
        parsed.data.secretKey,
        CRYPTO_PURPOSE.platformGatewaySecretKey
      ),
      webhookSecretEnc: encrypt(
        webhookSecret,
        CRYPTO_PURPOSE.platformGatewayWebhookSecret
      ),
      secretKeyHint: secretHint(parsed.data.secretKey),
      webhookUrl,
      webhookVersion: PLATFORM_WEBHOOK_VERSION,
      environment,
      accountLabel: `PayMongo (${mode ?? "unknown"} mode)`,
      connectedById: admin.id,
      connectedAt: new Date(),
      disconnectedAt: null,
    },
  });

  revalidatePlatformGatewaySurfaces();
  return {
    success:
      "PayMongo connected and its payment webhook is registered. Player payments and service-fee settlements are deposited into this account.",
  };
}

export async function disconnectPlatformGatewayAction(
  _prev: PlatformGatewayFormState,
  _formData: FormData
): Promise<PlatformGatewayFormState> {
  await requireAdmin();
  await requireRecentMfa("/dashboard/admin/payments");

  await reconcileServiceFeeCheckouts();

  const active = await prisma.serviceFeeSettlement.count({
    where: { provider: "paymongo", status: "AWAITING_PAYMENT" },
  });
  if (active > 0) {
    return {
      message:
        "This account has an active PayMongo settlement. Let it complete or expire before disconnecting.",
    };
  }

  if ((await inFlightPlatformPayments()).length > 0) {
    return {
      message:
        "A player is paying through this account right now. Wait for that checkout to complete or expire before disconnecting.",
    };
  }

  const updated = await prisma.platformGateway.updateMany({
    where: { provider: "paymongo", disconnectedAt: null },
    data: { disconnectedAt: new Date() },
  });
  if (!updated.count) {
    return {
      message:
        "No dashboard-managed PayMongo account is connected. Environment-based keys must be removed from the deployment settings.",
    };
  }

  revalidatePlatformGatewaySurfaces();
  return {
    success:
      "PayMongo disconnected. Automatic player checkout and online settlements are paused; payments already collected can still be refunded.",
  };
}
