// Exercises exactly what connectGatewayAction does, minus the Next.js wrapper:
// verify -> encrypt -> upsert -> read back through the DAL. Then cleans up.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CRYPTO_PURPOSE, encrypt, decrypt, isEncryptionConfigured, secretHint } from "@/lib/crypto";
import { getVenueGateway } from "@/lib/payments/venue";

import { ok, run } from "./harness";
import { installPaymongoMock } from "./paymongo-mock";

// PayMongo stands in at the wire, so verifyCredentials exercises the real
// adapter without reaching their servers.
installPaymongoMock();
const prisma = new PrismaClient();

const SECRET = "sk_test_" + crypto.randomBytes(12).toString("hex");
const WEBHOOK = "whsec_" + crypto.randomBytes(16).toString("hex");

async function main() {
  ok("encryption configured", isEncryptionConfigured());

  // Deliberately NOT the partner: they may have a real gateway connected, and
  // this script must not disturb it.
  const partner = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!partner) throw new Error("no partner user in db");

  const before = await prisma.partnerGateway.findUnique({
    where: { userId: partner.id },
  });
  ok("starts with no gateway (clean slate)", before === null);

  // 1. A bad key must be rejected BEFORE anything is stored.
  const bad = await getVenueGateway({
    provider: "paymongo",
    publicKey: "pk_test_abcdefgh",
    secretKey: "nope",
    webhookSecret: WEBHOOK,
  }).verifyCredentials();
  ok("bad secret key rejected", bad.ok === false);

  // 2. Good keys verify.
  const creds = {
    provider: "paymongo" as const,
    publicKey: "pk_test_abcdefgh",
    secretKey: SECRET,
    webhookSecret: WEBHOOK,
  };
  const good = await getVenueGateway(creds).verifyCredentials();
  ok("good keys verify", good.ok === true);

  // 3. Store.
  const row = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: creds.provider,
      publicKey: creds.publicKey,
      secretKeyEnc: encrypt(creds.secretKey, CRYPTO_PURPOSE.gatewaySecretKey),
      webhookSecretEnc: encrypt(
        creds.webhookSecret,
        CRYPTO_PURPOSE.gatewayWebhookSecret
      ),
      secretKeyHint: secretHint(creds.secretKey),
      webhookToken: crypto.randomBytes(24).toString("base64url"),
      accountLabel: good.ok ? good.accountLabel : null,
    },
  });

  ok("ciphertext is versioned", row.secretKeyEnc.startsWith("v1."));
  ok("ciphertext holds no plaintext", !row.secretKeyEnc.includes("sk_"));
  ok("ciphertext holds no plaintext (webhook)", !row.webhookSecretEnc.includes("whsec_"));
  ok("hint is a suffix only", SECRET.endsWith(row.secretKeyHint.replace(/\D*/, "").slice(-4)));
  ok("webhook token is not the user id", row.webhookToken !== partner.id);
  ok("webhook token is long", row.webhookToken.length >= 30);

  // 4. Round trip.
  ok(
    "secret decrypts",
    decrypt(row.secretKeyEnc, CRYPTO_PURPOSE.gatewaySecretKey) === SECRET
  );
  ok(
    "webhook secret decrypts",
    decrypt(row.webhookSecretEnc, CRYPTO_PURPOSE.gatewayWebhookSecret) === WEBHOOK
  );

  // 5. Purpose binding: a webhook ciphertext must NOT decrypt as a secret key.
  let crossed = false;
  try {
    decrypt(row.webhookSecretEnc, CRYPTO_PURPOSE.gatewaySecretKey);
    crossed = true;
  } catch {
    /* expected */
  }
  ok("purposes are not interchangeable", !crossed);

  // 6. Disconnect keeps the ciphertext (refunds must still work).
  const off = await prisma.partnerGateway.update({
    where: { userId: partner.id },
    data: { disconnectedAt: new Date() },
  });
  ok("disconnect retains ciphertext", off.secretKeyEnc === row.secretKeyEnc);
  ok("disconnect is recorded", off.disconnectedAt !== null);

  const active = await prisma.partnerGateway.findFirst({
    where: { userId: partner.id, disconnectedAt: null },
  });
  ok("disconnected gateway is not active", active === null);

  // 7. Reconnect clears it and keeps the same token.
  const on = await prisma.partnerGateway.update({
    where: { userId: partner.id },
    data: { disconnectedAt: null },
  });
  ok("reconnect re-enables", on.disconnectedAt === null);
  ok("webhook token survives reconnect", on.webhookToken === row.webhookToken);

  // Clean up — this checkpoint must leave the database exactly as it was.
  await prisma.partnerGateway.delete({ where: { userId: partner.id } });
  const after = await prisma.partnerGateway.count({
    where: { userId: partner.id },
  });
  ok("cleaned up", after === 0);

}

void run(main, async () => {
  await prisma.$disconnect();
});
