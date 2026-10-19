// Players connect DUPR through DUPR's consent page. Every reported DUPR ID is
// verified with DUPR before it is stored, one DUPR account maps to one
// Bunal.club account, and ratings refresh from DUPR's batch lookup.
//
//   npm run check:dupr-link
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { duprIdFromConsentMessage } from "@/lib/dupr-shared";

const prisma = new PrismaClient();
const emails = [
  "check-dupr-link-one@example.test",
  "check-dupr-link-two@example.test",
];
const DUPR_ENV = {
  DUPR_API_BASE_URL: "https://dupr.example.test/api",
  DUPR_CLIENT_KEY: "check-client",
  DUPR_CLIENT_SECRET: "check-secret",
  DUPR_SSO_URL: "https://login.dupr.example.test/consent",
};
const previousEnv = Object.fromEntries(
  Object.keys(DUPR_ENV).map((key) => [key, process.env[key]])
);

type Recorded = { url: string; headers: Headers; body: unknown };

// DUPR as the batch endpoint describes it: the IDs in `known` consented to
// Bunal.club and are returned; anything else is notFound.
function mockDupr(known: Record<string, { doubles: string | null; singles: string | null }>) {
  const requests: Recorded[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, headers: new Headers(init?.headers), body });
    if (url.endsWith("/auth/v1.0/token")) {
      return Response.json({
        status: "SUCCESS",
        result: { token: "check-token", expiry: new Date(Date.now() + 3_600_000).toISOString() },
      });
    }
    const ids: string[] = body?.duprIds ?? [];
    return Response.json({
      status: "SUCCESS",
      result: {
        users: ids
          .filter((id) => known[id])
          .map((id) => ({
            id,
            fullName: `Player ${id}`,
            ratings: {
              doubles: known[id].doubles,
              singles: known[id].singles,
              isDoublesReliable: true,
              isSinglesReliable: false,
            },
          })),
        notFound: ids.filter((id) => !known[id]),
      },
    });
  }) as typeof fetch;
  return { fetcher, requests };
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

async function check() {
  Object.assign(process.env, DUPR_ENV);
  await cleanup();

  // --- Reading DUPR's consent message ------------------------------------
  ok(
    "the consent message parser finds the DUPR ID in likely shapes",
    duprIdFromConsentMessage({ duprId: "ab12cd" }) === "AB12CD" &&
      duprIdFromConsentMessage(JSON.stringify({ user: { id: "XY98ZT" } })) === "XY98ZT" &&
      duprIdFromConsentMessage({ result: { duprId: "QWERTY" } }) === "QWERTY"
  );
  ok(
    "anything that isn't a DUPR ID is ignored",
    duprIdFromConsentMessage({ duprId: "not-an-id" }) === null &&
      duprIdFromConsentMessage("garbage") === null &&
      duprIdFromConsentMessage(null) === null
  );

  stubRequestContext({ id: "check-dupr-actor", email: emails[0], role: "PLAYER" });
  const { fetchDuprUsers, verifyDuprConsent, readPartnerConfig } = await import("@/lib/dupr");
  const config = readPartnerConfig();
  ok("partner config reads without a club ID", config !== null);
  if (!config) return;

  // --- Batch lookup ---------------------------------------------------------
  const many = Array.from({ length: 150 }, (_, index) =>
    `P${String(index).padStart(5, "0")}`
  );
  const batch = mockDupr(
    Object.fromEntries(many.map((id) => [id, { doubles: "3.851", singles: "NR" }]))
  );
  const looked = await fetchDuprUsers(config, many, batch.fetcher);
  const batchCalls = batch.requests.filter((request) => request.url.endsWith("/user/v1.0/batch"));
  ok(
    "batch lookups are split into requests of at most 100 IDs",
    batchCalls.length === 2 &&
      (batchCalls[0].body as { duprIds: string[] }).duprIds.length === 100 &&
      (batchCalls[1].body as { duprIds: string[] }).duprIds.length === 50
  );
  ok(
    "batch lookups use the partner bearer token",
    batchCalls.every((request) => request.headers.get("authorization") === "Bearer check-token")
  );
  ok(
    "ratings parse as numbers, and an unreadable rating becomes null",
    looked.users.length === 150 &&
      looked.users[0].doubles === 3.851 &&
      looked.users[0].singles === null &&
      looked.users[0].doublesReliable === true
  );

  const consent = mockDupr({ AB12CD: { doubles: "4.102", singles: "3.990" } });
  ok(
    "a DUPR ID that DUPR returns is verified",
    (await verifyDuprConsent(config, "AB12CD", consent.fetcher))?.doubles === 4.102
  );
  ok(
    "a DUPR ID that DUPR doesn't return is refused",
    (await verifyDuprConsent(config, "ZZ99ZZ", consent.fetcher)) === null
  );
  const before = consent.requests.length;
  ok(
    "a malformed DUPR ID is refused without calling DUPR",
    (await verifyDuprConsent(config, "bad id", consent.fetcher)) === null &&
      consent.requests.length === before
  );

  // --- Linking --------------------------------------------------------------
  const [one, two] = await prisma.$transaction([
    prisma.user.create({ data: { email: emails[0], name: "Dupr One", role: "PLAYER" }, select: { id: true } }),
    prisma.user.create({ data: { email: emails[1], name: "Dupr Two", role: "PLAYER" }, select: { id: true } }),
  ]);
  const { linkDuprAccount, unlinkDuprAccount, refreshDuprRatings } = await import("@/lib/dupr-link");

  const refused = await linkDuprAccount({ userId: one.id, duprId: "ZZ99ZZ" }, consent.fetcher);
  ok(
    "an unverified DUPR ID is never stored",
    refused.status === "not-verified" &&
      (await prisma.duprLink.count({ where: { userId: one.id } })) === 0
  );

  const linked = await linkDuprAccount({ userId: one.id, duprId: "AB12CD" }, consent.fetcher);
  const stored = await prisma.duprLink.findUnique({ where: { userId: one.id } });
  ok(
    "a verified DUPR account is linked with its ratings",
    linked.status === "linked" &&
      stored?.duprId === "AB12CD" &&
      Number(stored.doubles) === 4.102 &&
      Number(stored.singles) === 3.99
  );
  ok(
    "one DUPR account can't be linked to a second Bunal.club account",
    (await linkDuprAccount({ userId: two.id, duprId: "AB12CD" }, consent.fetcher)).status === "taken"
  );

  // --- Refreshing -----------------------------------------------------------
  const fresh = await refreshDuprRatings({}, consent.fetcher);
  ok("a link refreshed today is left alone", fresh.refreshed === 0);
  await prisma.duprLink.update({
    where: { userId: one.id },
    data: { ratingsUpdatedAt: new Date("2000-01-01T00:00:00.000Z") },
  });
  const updated = mockDupr({ AB12CD: { doubles: "4.250", singles: "4.000" } });
  const refreshed = await refreshDuprRatings({}, updated.fetcher);
  ok(
    "a stale link picks up DUPR's new rating",
    refreshed.refreshed >= 1 &&
      Number((await prisma.duprLink.findUnique({ where: { userId: one.id } }))?.doubles) === 4.25
  );
  await prisma.duprLink.update({
    where: { userId: one.id },
    data: { ratingsUpdatedAt: new Date("2000-01-01T00:00:00.000Z") },
  });
  await refreshDuprRatings({}, mockDupr({}).fetcher);
  const revoked = await prisma.duprLink.findUnique({ where: { userId: one.id } });
  ok(
    "a player DUPR stops returning keeps the link but is marked",
    revoked !== null && revoked.consentLostAt !== null
  );

  ok(
    "disconnecting removes the link",
    (await unlinkDuprAccount(one.id)) &&
      (await prisma.duprLink.count({ where: { userId: one.id } })) === 0
  );
}

async function checkAssistedRefusal() {
  // A separate stub: an admin assisting this player may not link DUPR.
  stubRequestContext(
    { id: "check-dupr-admin", email: "admin@example.test", role: "ADMIN" },
    { impersonation: { user: { id: "check-dupr-player" } } }
  );
  const { linkDuprAccountAction } = await import("@/lib/dupr-actions");
  const form = new FormData();
  form.set("duprId", "AB12CD");
  const result = await linkDuprAccountAction({}, form);
  ok(
    "connecting DUPR is refused while an admin is assisting",
    result.message?.startsWith("Exit assistance first") === true
  );
}

void run(
  async () => {
    await check();
    await checkAssistedRefusal();
  },
  async () => {
    await cleanup();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma.$disconnect();
  }
);
