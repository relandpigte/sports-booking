// Assisted partner sessions store only hashed browser tokens and preserve an
// append-only actor/target audit trail.
//
//   npm run check:impersonation
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import {
  hashImpersonationToken,
  PARTNER_IMPERSONATION_MINUTES,
} from "@/lib/impersonation-token";

const prisma = new PrismaClient();
const emails = [
  "check-assistance-admin@example.test",
  "check-assistance-partner@example.test",
];

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.partnerImpersonationAudit.deleteMany({
      where: { OR: [{ adminId: { in: ids } }, { partnerId: { in: ids } }] },
    });
    await prisma.partnerImpersonationSession.deleteMany({
      where: { OR: [{ adminId: { in: ids } }, { partnerId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

async function check() {
  await cleanup();
  const [admin, partner] = await prisma.$transaction([
    prisma.user.create({
      data: { email: emails[0], name: "Assistance Admin", role: "ADMIN" },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        email: emails[1],
        name: "Assisted Partner",
        role: "PARTNER",
        partnerStatus: "PENDING",
      },
      select: { id: true },
    }),
  ]);

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashImpersonationToken(rawToken);
  const expiresAt = new Date(
    Date.now() + PARTNER_IMPERSONATION_MINUTES * 60_000
  );
  const session = await prisma.partnerImpersonationSession.create({
    data: {
      tokenHash,
      adminId: admin.id,
      partnerId: partner.id,
      expiresAt,
    },
    select: { id: true, tokenHash: true },
  });
  await prisma.partnerImpersonationAudit.create({
    data: {
      sessionId: session.id,
      adminId: admin.id,
      partnerId: partner.id,
      action: "HUB_UPDATED",
      targetType: "Hub",
      targetId: "check-hub",
    },
  });

  ok("the raw assistance token is never stored", session.tokenHash !== rawToken);
  ok("token hashing is deterministic", session.tokenHash === tokenHash);

  const active = await prisma.partnerImpersonationSession.findFirst({
    where: { tokenHash, endedAt: null, expiresAt: { gt: new Date() } },
  });
  ok(
    "an unexpired session resolves to the intended admin and partner",
    active?.adminId === admin.id && active.partnerId === partner.id
  );

  const audit = await prisma.partnerImpersonationAudit.findFirst({
    where: { sessionId: session.id, action: "HUB_UPDATED" },
  });
  ok(
    "the audit records both the real actor and assisted account",
    audit?.adminId === admin.id &&
      audit.partnerId === partner.id &&
      audit.targetId === "check-hub"
  );

  await prisma.partnerImpersonationSession.update({
    where: { id: session.id },
    data: { endedAt: new Date(), endedReason: "CHECK_COMPLETE" },
  });
  const ended = await prisma.partnerImpersonationSession.findFirst({
    where: { tokenHash, endedAt: null, expiresAt: { gt: new Date() } },
  });
  ok("an ended session cannot resolve as active", ended === null);
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
