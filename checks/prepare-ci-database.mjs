import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (process.env.CI !== "true" || !databaseUrl) {
  throw new Error("CI fixture setup may only run in CI with DATABASE_URL set.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, "");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (!localHosts.has(parsedDatabaseUrl.hostname) || databaseName !== "bunal_check") {
  throw new Error(
    "Refusing to prepare fixtures outside the local bunal_check database."
  );
}

const prisma = new PrismaClient();

const FIXTURES = {
  adminEmail: "ci-admin@example.test",
  playerEmail: "ci-player@example.test",
  partnerEmail: "ci-partner@example.test",
  hubSlug: "ci-baseline-venue",
};

async function main() {
  await prisma.user.upsert({
    where: { email: FIXTURES.adminEmail },
    update: { role: "ADMIN" },
    create: {
      email: FIXTURES.adminEmail,
      name: "CI Admin",
      playerName: "ci-admin",
      role: "ADMIN",
      passwordHash: "ci-only",
    },
  });

  await prisma.user.upsert({
    where: { email: FIXTURES.playerEmail },
    update: { role: "PLAYER" },
    create: {
      email: FIXTURES.playerEmail,
      name: "CI Player",
      playerName: "ci-player",
      role: "PLAYER",
      passwordHash: "ci-only",
    },
  });

  const partner = await prisma.user.upsert({
    where: { email: FIXTURES.partnerEmail },
    update: { role: "PARTNER", partnerStatus: "ACTIVE" },
    create: {
      email: FIXTURES.partnerEmail,
      name: "CI Partner",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      passwordHash: "ci-only",
    },
    select: { id: true },
  });

  await prisma.partnerGateway.upsert({
    where: { userId: partner.id },
    update: {},
    create: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_ci_baseline",
      secretKeyEnc: "ci-only",
      webhookSecretEnc: "ci-only",
      secretKeyHint: "…line",
      webhookToken: "ci-baseline-webhook-token-not-for-production",
    },
  });

  const hub = await prisma.hub.upsert({
    where: { slug: FIXTURES.hubSlug },
    update: { ownerId: partner.id },
    create: {
      slug: FIXTURES.hubSlug,
      ownerId: partner.id,
      name: "CI Baseline Venue",
      coverPhotos: [],
      games: ["pickleball"],
    },
    select: { id: true },
  });

  const court = await prisma.court.findFirst({
    where: { hubId: hub.id, name: "Court 1" },
    select: { id: true },
  });

  if (!court) {
    await prisma.court.create({
      data: {
        hubId: hub.id,
        name: "Court 1",
        courtType: "covered",
        hourlyRate: 500,
      },
    });
  }

  console.log("CI baseline fixtures are ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
