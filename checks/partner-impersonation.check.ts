// Admin assist sessions store only hashed browser tokens, preserve an
// append-only actor/target audit trail, and work for any non-admin account:
// profile edits and payment settings follow the assisted user, while paying,
// sending messages, and admin targets stay blocked.
//
//   npm run check:impersonation
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  hashImpersonationToken,
  PARTNER_IMPERSONATION_COOKIE,
  PARTNER_IMPERSONATION_MINUTES,
} from "@/lib/impersonation-token";

const prisma = new PrismaClient();
const emails = [
  "check-assistance-admin@example.test",
  "check-assistance-partner@example.test",
  "check-assistance-player@example.test",
  "check-assistance-other-admin@example.test",
];
const BLOCKED = "Payments can't be made while assisting a user.";

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.partnerImpersonationAudit.deleteMany({
      where: {
        OR: [{ adminId: { in: ids } }, { assistedUserId: { in: ids } }],
      },
    });
    await prisma.partnerImpersonationSession.deleteMany({
      where: {
        OR: [{ adminId: { in: ids } }, { assistedUserId: { in: ids } }],
      },
    });
    await prisma.partnerStaffActivity.deleteMany({
      where: { partnerId: { in: ids } },
    });
    await prisma.payoutAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

function sessionToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashImpersonationToken(raw) };
}

async function check() {
  await cleanup();
  const [admin, partner, player, otherAdmin] = await prisma.$transaction([
    prisma.user.create({
      data: { email: emails[0], name: "Assistance Admin", role: "ADMIN" },
      select: { id: true, email: true },
    }),
    prisma.user.create({
      data: {
        email: emails[1],
        name: "Assisted Partner",
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: emails[2], name: "Assisted Player", role: "PLAYER" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: emails[3], name: "Other Admin", role: "ADMIN" },
      select: { id: true },
    }),
  ]);
  // The player is also a trainer and a staff member of the partner.
  await prisma.trainerProfile.create({
    data: {
      userId: player.id,
      status: "ACTIVE",
      sports: ["pickleball"],
      specialties: ["Fundamentals"],
    },
  });
  await prisma.partnerStaffMembership.create({
    data: {
      partnerId: partner.id,
      userId: player.id,
      bookings: "VIEW",
      messages: "VIEW",
    },
  });

  const expiresAt = new Date(
    Date.now() + PARTNER_IMPERSONATION_MINUTES * 60_000
  );
  const playerToken = sessionToken();
  const adminTargetToken = sessionToken();
  const session = await prisma.partnerImpersonationSession.create({
    data: {
      tokenHash: playerToken.hash,
      adminId: admin.id,
      assistedUserId: player.id,
      expiresAt,
    },
    select: { id: true, tokenHash: true },
  });
  // A row that should never resolve: assist sessions may not target admins.
  await prisma.partnerImpersonationSession.create({
    data: {
      tokenHash: adminTargetToken.hash,
      adminId: admin.id,
      assistedUserId: otherAdmin.id,
      expiresAt,
    },
  });
  await prisma.partnerImpersonationAudit.create({
    data: {
      sessionId: session.id,
      adminId: admin.id,
      assistedUserId: player.id,
      action: "HUB_UPDATED",
      targetType: "Hub",
      targetId: "check-hub",
    },
  });

  ok(
    "the raw assistance token is never stored",
    session.tokenHash !== playerToken.raw
  );
  ok(
    "token hashing is deterministic",
    session.tokenHash === hashImpersonationToken(playerToken.raw)
  );

  // --- The real session lookup, with only the cookie store faked ----------
  // Stub navigation and the session first, then drop the harness's stand-in
  // for impersonation.ts so the real module is the one loaded.
  stubRequestContext({ id: admin.id, email: admin.email, role: "ADMIN" });
  let cookieToken = playerToken.raw;
  const req = createRequire(import.meta.url);
  delete req.cache[path.join(process.cwd(), "src/lib/impersonation.ts")];
  const headersId = req.resolve("next/headers");
  req.cache[headersId] = {
    id: headersId,
    filename: headersId,
    loaded: true,
    exports: {
      cookies: async () => ({
        get: (name: string) =>
          name === PARTNER_IMPERSONATION_COOKIE
            ? { name, value: cookieToken }
            : undefined,
      }),
    },
  } as unknown as NodeModule;
  const { getActiveImpersonation } = await import("@/lib/impersonation");

  const resolved = await getActiveImpersonation(admin.id);
  ok(
    "a session for a player resolves to the admin and that player",
    resolved?.admin.id === admin.id && resolved.user.id === player.id
  );
  ok(
    "the assisted user has the same shape getCurrentUser returns",
    resolved !== null &&
      "chatRestrictedAt" in resolved.user &&
      "partnerPaymentMode" in resolved.user
  );
  ok(
    "another admin's browser cannot use the session",
    (await getActiveImpersonation(otherAdmin.id)) === null
  );
  cookieToken = adminTargetToken.raw;
  ok(
    "a session targeting an admin account never resolves",
    (await getActiveImpersonation(admin.id)) === null
  );

  const audit = await prisma.partnerImpersonationAudit.findFirst({
    where: { sessionId: session.id, action: "HUB_UPDATED" },
  });
  ok(
    "the audit records both the real actor and assisted account",
    audit?.adminId === admin.id &&
      audit.assistedUserId === player.id &&
      audit.targetId === "check-hub"
  );

  // --- Features as the assisted player ------------------------------------
  const assistedUser = await prisma.user.findUniqueOrThrow({
    where: { id: player.id },
  });
  const assistedActions: Array<Record<string, unknown>> = [];
  stubRequestContext(
    { id: admin.id, email: admin.email, role: "ADMIN" },
    {
      impersonation: {
        sessionId: session.id,
        admin: { id: admin.id, name: "Assistance Admin", email: admin.email },
        user: assistedUser,
      },
      workspaceMutationTargetUserId: player.id,
      onImpersonatedAction: (input) => assistedActions.push(input),
    }
  );

  const { updateProfileAction } = await import("@/lib/actions");
  const profile = new FormData();
  profile.set("name", "Updated Assisted Player");
  profile.set("playerName", "Assisted Nickname");
  profile.set("phone", "+63 917 123 4567");
  profile.set("skillLevel", "advanced");
  profile.set("privateProfile", "on");
  profile.set("image", "");
  const profileResult = await updateProfileAction({}, profile);
  const [adminAfterEdit, playerAfterEdit] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
      select: { name: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: player.id },
      select: { name: true, playerName: true, skillLevel: true },
    }),
  ]);
  ok(
    "an assisted profile edit updates the player instead of the admin",
    profileResult.ok === true &&
      adminAfterEdit.name === "Assistance Admin" &&
      playerAfterEdit.name === "Updated Assisted Player" &&
      playerAfterEdit.playerName === "Assisted Nickname" &&
      playerAfterEdit.skillLevel === "advanced"
  );
  ok(
    "the assisted profile edit emits an actor-target audit event",
    assistedActions.some(
      (entry) =>
        entry.action === "PROFILE_UPDATED" &&
        entry.targetType === "User" &&
        entry.targetId === player.id
    )
  );

  const { saveTrainerPayoutAccountAction } = await import(
    "@/lib/payout-actions"
  );
  const payoutForm = new FormData();
  payoutForm.set("network", "GCASH");
  payoutForm.set("accountName", "Assisted Player");
  payoutForm.set("accountNumber", "09171234567");
  const payoutResult = await saveTrainerPayoutAccountAction({}, payoutForm);
  const payoutAccount = await prisma.payoutAccount.findUnique({
    where: { userId: player.id },
    select: { accountNumber: true, updatedById: true },
  });
  ok(
    "an admin can set an assisted trainer's payout account",
    Boolean(payoutResult.success) &&
      payoutAccount?.accountNumber === "09171234567"
  );
  ok(
    "the payout change is attributed to the admin and audited",
    payoutAccount?.updatedById === admin.id &&
      assistedActions.some(
        (entry) =>
          entry.action === "TRAINER_PAYOUT_ACCOUNT_UPDATED" &&
          entry.targetId === player.id
      )
  );

  const payForm = new FormData();
  payForm.set("paymentId", "check-missing-payment");
  payForm.set("publicId", "check-missing-event");
  const [{ payForBookingAction, continueHeldBookingPaymentAction }, { payForEventAction }] =
    await Promise.all([
      import("@/lib/booking-payment-actions"),
      import("@/lib/event-payment-actions"),
    ]);
  const { submitManualPaymentProofAction } = await import(
    "@/lib/manual-payment-actions"
  );
  const {
    payTrainerSessionAction,
    submitTrainerManualProofAction,
    startTrainerServiceFeeCheckoutAction,
    submitTrainerServiceFeeSettlementAction,
  } = await import("@/lib/trainer-payment-actions");
  const paymentResults = await Promise.all([
    payForBookingAction({}, payForm),
    continueHeldBookingPaymentAction({}, payForm),
    payForEventAction({}, payForm),
    submitManualPaymentProofAction({}, payForm),
    payTrainerSessionAction({}, payForm),
    submitTrainerManualProofAction({}, payForm),
    startTrainerServiceFeeCheckoutAction({}, payForm),
    submitTrainerServiceFeeSettlementAction({}, payForm),
  ]);
  ok(
    "every way to pay or submit a payment is refused while assisting",
    paymentResults.every((result) => result.message === BLOCKED)
  );

  const { getPartnerWorkspace } = await import("@/lib/staffing");
  const staffWorkspace = await getPartnerWorkspace({ selectedStaffOnly: false });
  ok(
    "assisting a staff member resolves their staff workspace and access",
    staffWorkspace?.kind === "STAFF" &&
      staffWorkspace.partnerId === partner.id &&
      staffWorkspace.permissions.bookings === "VIEW" &&
      staffWorkspace.permissions.payments === "NONE"
  );
  ok(
    "staff work done while assisting is recorded under the admin",
    staffWorkspace?.actorId === admin.id &&
      staffWorkspace.assistedByAdminId === admin.id
  );

  const { getMessageViewer, sendConversationMessage } = await import(
    "@/lib/messages"
  );
  const viewer = await getMessageViewer();
  ok(
    "messages open as the assisted player, read-only",
    viewer?.id === player.id &&
      viewer.readOnly === true &&
      viewer.canSend === false
  );
  const sent = await sendConversationMessage("check-missing-conversation", {
    body: "Hello",
  });
  ok(
    "sending a message while assisting is refused",
    sent.error === "Messages are read-only while assisting."
  );

  await prisma.partnerImpersonationSession.update({
    where: { id: session.id },
    data: { endedAt: new Date(), endedReason: "CHECK_COMPLETE" },
  });
  cookieToken = playerToken.raw;
  ok(
    "an ended session cannot resolve as active",
    (await getActiveImpersonation(admin.id)) === null
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
