// Partner approval gates public visibility.
//
//   npm run check:partner
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";

const prisma = new PrismaClient();
const EMAIL = "check-pending-partner@example.test";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function check() {
  await cleanup();
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Seed an admin user first.");
  stubRequestContext(admin);

  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      partnerStatus: "PENDING",
      name: "Pending Venue",
      email: EMAIL,
      passwordHash: "x",
      partnerGateway: {
        create: {
          provider: "paymongo",
          publicKey: "pk_test_abcdefgh",
          secretKeyEnc: "x",
          webhookSecretEnc: "x",
          secretKeyHint: "…test",
          webhookToken: crypto.randomBytes(18).toString("base64url"),
        },
      },
      hubs: {
        create: {
          name: "Pending Venue",
          coverPhotos: [],
          games: ["pickleball"],
        },
      },
    },
    select: { id: true, hubs: { select: { id: true } } },
  });

  const { listPublicHubs, getPublicHub } = await import("@/lib/hubs");
  const visible = async () =>
    (await listPublicHubs()).some((hub) => hub.id === partner.hubs[0].id);

  ok("new partner starts hidden", !(await visible()));
  ok(
    "direct hub view explains approval",
    (await getPublicHub(partner.hubs[0].id))?.blockedBy === "approval"
  );

  await prisma.user.update({
    where: { id: partner.id },
    data: {
      partnerStatus: "ACTIVE",
      partnerActivatedAt: new Date(),
      partnerActivatedById: "check-admin",
    },
  });
  ok("activated partner stays hidden until court setup", !(await visible()));

  await prisma.court.create({
    data: {
      hubId: partner.hubs[0].id,
      name: "Court 1",
      courtType: "covered",
      hourlyRate: 500,
    },
  });
  ok("activated partner with a court is listed", await visible());

  await prisma.user.update({
    where: { id: partner.id },
    data: {
      partnerStatus: "PENDING",
      partnerActivatedAt: null,
      partnerActivatedById: null,
    },
  });
  ok("deactivated partner is hidden again", !(await visible()));
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
