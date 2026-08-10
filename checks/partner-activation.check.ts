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
        partnerStatus: "DRAFT",
        name: "Pending Venue",
        playerName: "Venue Owner",
        phone: "09171234567",
        email: EMAIL,
        passwordHash: "x",
        hubs: {
          create: {
            name: "Pending Venue",
            slug: "check-pending-partner",
            coverPhotos: [],
            games: ["pickleball"],
            address: "123 Check Street, Manila",
          },
        },
      },
      select: { id: true, hubs: { select: { id: true } } },
    });

    const { listPublicHubs, listPublicHubDirectory, getPublicHub } =
      await import("@/lib/hubs");
    const listedHub = async () =>
      (await listPublicHubs()).find((hub) => hub.id === partner.hubs[0].id);
    const visible = async () => Boolean(await listedHub());

    ok("draft partner starts hidden", !(await visible()));
    ok(
      "direct hub view explains approval",
      (await getPublicHub(partner.hubs[0].id))?.blockedBy === "approval"
    );

    const { setPartnerActiveAction } = await import("@/lib/admin-actions");
    const activation = new FormData();
    activation.set("userId", partner.id);
    activation.set("active", "true");
    await setPartnerActiveAction(activation);
    const stillDraft = await prisma.user.findUnique({
      where: { id: partner.id },
      select: { partnerStatus: true },
    });
    ok(
      "draft partners cannot be activated before submission",
      stillDraft?.partnerStatus === "DRAFT" && requests.length === 0
    );

    await prisma.user.update({
      where: { id: partner.id },
      data: { partnerStatus: "PENDING" },
    });
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
    const comingSoonHub = await listedHub();
    ok("activated partner with a court is listed", Boolean(comingSoonHub));
    ok(
      "hub without PayMongo is publicly coming soon",
      comingSoonHub?.comingSoon === true &&
        comingSoonHub.bookable === false &&
        comingSoonHub.verified === false
    );

    const datedDirectory = await listPublicHubDirectory({
      date: "2099-01-01",
    });
    ok(
      "coming-soon hub does not expose availability",
      datedDirectory.find((hub) => hub.id === partner.hubs[0].id)
        ?.availableSlots === null
    );
    const bookableWindow = await listPublicHubDirectory({
      date: "2099-01-01",
      fromHour: 8,
      toHour: 9,
    });
    ok(
      "coming-soon hub is excluded from bookable time filters",
      !bookableWindow.some((hub) => hub.id === partner.hubs[0].id)
    );

    await prisma.partnerGateway.create({
      data: {
        user: { connect: { id: partner.id } },
        provider: "paymongo",
        publicKey: "pk_test_abcdefgh",
        secretKeyEnc: "x",
        webhookSecretEnc: "x",
        secretKeyHint: "…test",
        webhookToken: crypto.randomBytes(18).toString("base64url"),
      },
    });
    const verifiedHub = await listedHub();
    ok(
      "connected hub becomes bookable and verified",
      verifiedHub?.bookable === true &&
        verifiedHub.comingSoon === false &&
        verifiedHub.verified === true
    );

    const deactivation = new FormData();
    deactivation.set("userId", partner.id);
    deactivation.set("active", "false");
    await setPartnerActiveAction(deactivation);
    const deactivated = await prisma.user.findUnique({
      where: { id: partner.id },
      select: { partnerStatus: true },
    });
    ok(
      "deactivation has a distinct status and hides the partner",
      deactivated?.partnerStatus === "DEACTIVATED" && !(await visible())
    );
    ok(
      "direct hub view identifies a deactivated owner",
      (await getPublicHub(partner.hubs[0].id))?.blockedBy === "inactive"
    );

    await setPartnerActiveAction(activation);
    const reactivated = await prisma.user.findUnique({
      where: { id: partner.id },
      select: { partnerStatus: true },
    });
    ok(
      "a deactivated partner can be reactivated without another approval email",
      reactivated?.partnerStatus === "ACTIVE" && requests.length === 1
    );
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
