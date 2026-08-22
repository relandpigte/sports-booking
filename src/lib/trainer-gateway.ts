import "server-only";

import { prisma } from "@/lib/db";
import { CRYPTO_PURPOSE, decrypt } from "@/lib/crypto";
import type { GatewayCredentials } from "@/lib/payments/venue";

export async function loadTrainerGatewayCredentials(
  gatewayId: string
): Promise<GatewayCredentials> {
  const row = await prisma.trainerGateway.findUnique({
    where: { id: gatewayId },
    select: {
      provider: true,
      publicKey: true,
      secretKeyEnc: true,
      webhookSecretEnc: true,
    },
  });
  if (!row) throw new Error("Trainer gateway not found");
  return {
    provider: row.provider as "paymongo",
    publicKey: row.publicKey,
    secretKey: decrypt(row.secretKeyEnc, CRYPTO_PURPOSE.gatewaySecretKey),
    webhookSecret: decrypt(
      row.webhookSecretEnc,
      CRYPTO_PURPOSE.gatewayWebhookSecret
    ),
  };
}
export async function getTrainerPaymentSetup(userId: string) {
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId },
    select: {
      paymentMode: true,
      user: {
        select: {
          trainerGateway: {
            select: { id: true, provider: true, disconnectedAt: true, accountLabel: true },
          },
          trainerManualMethods: {
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  const gateway =
    profile?.user.trainerGateway?.disconnectedAt == null
      ? profile?.user.trainerGateway ?? null
      : null;
  return {
    mode: profile?.paymentMode ?? "AUTOMATIC",
    automaticReady: gateway != null,
    manualReady: (profile?.user.trainerManualMethods.length ?? 0) > 0,
    gateway,
    methods: profile?.user.trainerManualMethods ?? [],
  };
}
