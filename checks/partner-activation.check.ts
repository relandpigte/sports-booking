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
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: string; headers: Headers }> = [];
  process.env.RESEND_API_KEY = "re_partner_approval_check_only";
  process.env.EMAIL_FROM = "Bunal.club <check@example.test>";
  globalThis.fetch = (async (_input, init) => {
    requests.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
    });
    return new Response(JSON.stringify({ id: "partner-approval-check" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
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

    const { setPartnerActiveAction } = await import("@/lib/admin-actions");
    const activation = new FormData();
    activation.set("userId", partner.id);
    activation.set("active", "true");
    await setPartnerActiveAction(activation);

    ok("approval sends one partner email", requests.length === 1);
    ok(
      "approval email contains the venue and setup action",
      requests[0]?.body.includes("Pending Venue") === true &&
        requests[0]?.body.includes("Continue venue setup") === true &&
        requests[0]?.body.includes("partner-approved") === true
    );
    ok(
      "approval email uses a stable idempotency key",
      requests[0]?.headers.get("Idempotency-Key") ===
        `partner-approved-${partner.id}`
    );
    await setPartnerActiveAction(activation);
    ok("repeated approval does not resend the email", requests.length === 1);
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
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  }
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
