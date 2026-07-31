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
import { platformWebhookUrlReachable } from "@/lib/platform-gateway";
import {
  PayMongoRequestError,
  getCheckoutSession,
  keyMode,
  paymongoRequest,
  registerPaymongoWebhook,
} from "@/lib/payments/paymongo-core";
import { appUrl } from "@/lib/urls";
import { ConnectPlatformGatewaySchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";

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

  if (!(await platformWebhookUrlReachable())) {
    return {
      message:
        "APP_URL does not currently reach this app's public settlement webhook. Point it to the live HTTPS site, restart the app, then connect again.",
    };
  }

  const webhookUrl = appUrl("/api/billing/webhook/paymongo");
  let webhookSecret =
    parsed.data.webhookSecret ??
    (await existingWebhookSecretForSameKey(parsed.data.secretKey));
  if (!webhookSecret) {
    const registered = await registerPaymongoWebhook(
      parsed.data.secretKey,
      webhookUrl
    );
    if (!registered.ok) {
      return { message: registered.message, needsWebhookSecret: true };
    }
    webhookSecret = registered.secret;
  }

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
      accountLabel: `PayMongo (${mode ?? "unknown"} mode)`,
      connectedById: admin.id,
      connectedAt: new Date(),
      disconnectedAt: null,
    },
  });

  revalidatePlatformGatewaySurfaces();
  return {
    success: parsed.data.webhookSecret
      ? "PayMongo connected. Service-fee payments will be deposited into this account."
      : "PayMongo connected and its settlement webhook was registered automatically.",
  };
}

export async function disconnectPlatformGatewayAction(
  _prev: PlatformGatewayFormState,
  _formData: FormData
): Promise<PlatformGatewayFormState> {
  await requireAdmin();

  const active = await prisma.serviceFeeSettlement.count({
    where: { provider: "paymongo", status: "AWAITING_PAYMENT" },
  });
  if (active > 0) {
    return {
      message:
        "This account has an active PayMongo settlement. Let it complete or expire before disconnecting.",
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
      "PayMongo disconnected. New online settlements are disabled; manual remittance remains available.",
  };
}
