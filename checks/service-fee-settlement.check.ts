// Service-fee accrual, weekly overdue gating, remittance review, and refunds.
//
//   npm run check:settlement
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  calculateServiceFeeBalance,
  ensureServiceFeeCharge,
  listAdminPartnerServiceFeeBreakdown,
  serviceFeeStanding,
} from "@/lib/service-fees";
import { markBookingPaymentRefunded } from "@/lib/booking-payments";

const prisma = new PrismaClient();
const EMAIL = "check-service-fee-settlement@example.test";
const NOW = new Date("2026-07-30T04:00:00Z");

async function cleanup() {
  const partner = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (partner) await prisma.user.delete({ where: { id: partner.id } });
}

async function check() {
  await cleanup();
  const [player, hub, admin] = await Promise.all([
    prisma.user.findFirst({
      where: { role: "PLAYER" },
      select: { id: true },
    }),
    prisma.hub.findFirst({ select: { id: true } }),
    prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true, email: true },
    }),
  ]);
  if (!player || !hub || !admin) {
    throw new Error("Seed a player, hub, and admin first.");
  }

  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      name: "Settlement Check",
      email: EMAIL,
      passwordHash: "x",
    },
    select: { id: true },
  });
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_settlement",
      secretKeyEnc: "x",
      webhookSecretEnc: "x",
      secretKeyHint: "…test",
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
    select: { id: true },
  });
  const partnerHub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Settlement Check Hub",
      coverPhotos: [],
      games: ["basketball"],
      courts: {
        create: {
          name: "Court 1",
          courtType: "covered",
          hourlyRate: 500,
        },
      },
    },
    select: { id: true },
  });

  const empty = await calculateServiceFeeBalance(prisma, partner.id, NOW);
  ok(
    "a partner with no accrued fees has no balance",
    serviceFeeStanding(empty) === "NO_BALANCE"
  );

  const payment = async (fee: number, paidAt: Date) =>
    prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        gatewayId: gateway.id,
        userId: player.id,
        hubId: hub.id,
        amount: 500 + fee,
        venueAmount: 500,
        platformFee: fee,
        method: "GCASH",
        status: "SUCCEEDED",
        expiresAt: paidAt,
        provider: "paymongo",
        paidAt,
      },
      select: { id: true, partnerId: true, platformFee: true, paidAt: true },
    });

  const old = await payment(30, new Date("2026-07-10T04:00:00Z"));
  const recent = await payment(15, new Date("2026-07-29T04:00:00Z"));

  await prisma.$transaction(async (tx) => {
    await ensureServiceFeeCharge(tx, old);
    await ensureServiceFeeCharge(tx, old);
    await ensureServiceFeeCharge(tx, recent);
  });
  ok(
    "a retried charge accrues only once",
    (await prisma.serviceFeeEntry.count({ where: { partnerId: partner.id } })) ===
      2
  );

  const initial = await calculateServiceFeeBalance(prisma, partner.id, NOW);
  ok("all service fees are outstanding", initial.amountDue === 45);
  ok("only the old weekly balance is overdue", initial.overdueAmount === 30);
  ok("an overdue balance blocks after the enforcement grace", initial.blocked);
  ok(
    "the standing marks an overdue partner",
    serviceFeeStanding(initial) === "OVERDUE"
  );
  const beforeDeadline = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    new Date("2026-07-13T04:00:00Z")
  );
  ok(
    "an outstanding balance before its deadline is due soon",
    serviceFeeStanding(beforeDeadline) === "DUE_SOON"
  );
  const enforcementGrace = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    new Date("2026-07-21T04:00:00Z")
  );
  ok(
    "an overdue balance receives three days before booking enforcement",
    enforcementGrace.overdueAmount === 30 &&
      enforcementGrace.inEnforcementGrace &&
      !enforcementGrace.blocked &&
      serviceFeeStanding(enforcementGrace) === "GRACE_PERIOD"
  );
  stubRequestContext({ id: admin.id, email: admin.email, role: "ADMIN" });
  const adminInitial = (
    await listAdminPartnerServiceFeeBreakdown(NOW)
  ).find((row) => row.partnerId === partner.id);
  ok(
    "the owner breakdown matches the partner's overdue balance",
    adminInitial?.standing === "OVERDUE" &&
      adminInitial.balance.amountDue === initial.amountDue &&
      adminInitial.balance.overdueAmount === initial.overdueAmount
  );
  const { listPublicHubs } = await import("@/lib/hubs");
  ok(
    "the hub remains public during the three-day enforcement grace",
    (await listPublicHubs({ now: new Date("2026-07-21T04:00:00Z") })).some(
      (listed) => listed.id === partnerHub.id
    )
  );
  ok(
    "an overdue partner's hub is hidden from the public directory",
    !(await listPublicHubs({ now: NOW })).some(
      (listed) => listed.id === partnerHub.id
    )
  );

  const settlement = await prisma.serviceFeeSettlement.create({
    data: {
      partnerId: partner.id,
      periodStart: old.platformFee ? new Date("2026-07-10T04:00:00Z") : NOW,
      periodEnd: NOW,
      amount: 30,
      paymentReference: "CHECK-1234",
      receiptImage: "data:image/png;base64,YQ==",
    },
    select: { id: true },
  });
  const submitted = await calculateServiceFeeBalance(prisma, partner.id, NOW);
  ok("submitted proof is tracked separately", submitted.pending === 30);
  ok("unapproved proof does not reduce the balance", submitted.amountDue === 45);
  ok("review time does not bypass an overdue booking block", submitted.blocked);
  ok(
    "a blocked balance remains overdue while proof is reviewed",
    serviceFeeStanding(submitted) === "OVERDUE"
  );
  const adminSubmitted = (
    await listAdminPartnerServiceFeeBreakdown(NOW)
  ).find((row) => row.partnerId === partner.id);
  ok(
    "the owner breakdown shows the same pending amount",
    adminSubmitted?.standing === "OVERDUE" &&
      adminSubmitted.balance.pending === submitted.pending
  );
  ok(
    "submitted proof cannot restore public visibility before approval",
    !(await listPublicHubs({ now: NOW })).some(
      (listed) => listed.id === partnerHub.id
    )
  );
  const { waiveServiceFeeBalanceAction, reverseServiceFeeWaiverAction } =
    await import("@/lib/service-fee-actions");
  const blockedWaiverData = new FormData();
  blockedWaiverData.set("partnerId", partner.id);
  blockedWaiverData.set("amount", "10.00");
  blockedWaiverData.set("reason", "Approved payment-system testing fees.");
  const blockedWaiver = await waiveServiceFeeBalanceAction(
    {},
    blockedWaiverData
  );
  ok(
    "an active settlement prevents an admin waiver",
    blockedWaiver.message?.includes("active PayMongo settlement") === true &&
      (await prisma.serviceFeeWaiver.count({
        where: { partnerId: partner.id },
      })) === 0
  );

  await prisma.serviceFeeSettlement.update({
    where: { id: settlement.id },
    data: { status: "REJECTED" },
  });
  const rejected = await calculateServiceFeeBalance(prisma, partner.id, NOW);
  ok("rejection restores the balance", rejected.amountDue === 45);
  ok("rejection restores the overdue gate", rejected.blocked);
  ok(
    "rejection hides the partner's hub again",
    !(await listPublicHubs({ now: NOW })).some(
      (listed) => listed.id === partnerHub.id
    )
  );

  const overdueWaiverData = new FormData();
  overdueWaiverData.set("partnerId", partner.id);
  overdueWaiverData.set("amount", "45.00");
  overdueWaiverData.set(
    "reason",
    "Waive the complete overdue balance for restriction testing."
  );
  await waiveServiceFeeBalanceAction({}, overdueWaiverData);
  const waivedOverdue = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    NOW
  );
  ok(
    "a full waiver immediately clears an overdue restriction",
    waivedOverdue.amountDue === 0 &&
      !waivedOverdue.blocked &&
      (await listPublicHubs({ now: NOW })).some(
        (listed) => listed.id === partnerHub.id
      )
  );
  const overdueWaiver = await prisma.serviceFeeWaiver.findFirst({
    where: { partnerId: partner.id, amount: 45 },
    select: { id: true },
  });
  if (!overdueWaiver) throw new Error("Expected the overdue waiver fixture.");
  const overdueReversalData = new FormData();
  overdueReversalData.set("waiverId", overdueWaiver.id);
  overdueReversalData.set(
    "reason",
    "Restore the overdue balance after restriction verification."
  );
  await reverseServiceFeeWaiverAction({}, overdueReversalData);
  const restoredOverdue = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    NOW
  );
  ok(
    "reversing an old-balance waiver restores overdue enforcement",
    restoredOverdue.amountDue === 45 &&
      restoredOverdue.blocked &&
      !(await listPublicHubs({ now: NOW })).some(
        (listed) => listed.id === partnerHub.id
      )
  );

  await prisma.serviceFeeSettlement.update({
    where: { id: settlement.id },
    data: { status: "PAID" },
  });
  await markBookingPaymentRefunded({
    paymentId: recent.id,
    amount: 515,
    refundRef: "re_check",
  });
  const refunded = await calculateServiceFeeBalance(prisma, partner.id, NOW);
  ok("a refund retains its service fee", refunded.earned === 45);
  ok("the retained recent fee remains due", refunded.amountDue === 15);
  ok("a recent retained fee does not block bookings", !refunded.blocked);
  ok(
    "the retained recent fee is due soon",
    serviceFeeStanding(refunded) === "DUE_SOON"
  );
  const adminCurrent = (
    await listAdminPartnerServiceFeeBreakdown(NOW)
  ).find((row) => row.partnerId === partner.id);
  ok(
    "the owner breakdown shows the retained balance and latest payment",
    adminCurrent?.standing === "DUE_SOON" &&
      adminCurrent.balance.amountDue === 15 &&
      adminCurrent.lastPaidAmount === 30
  );
  ok(
    "a non-overdue balance keeps the hub publicly visible",
    (await listPublicHubs({ now: NOW })).some(
      (listed) => listed.id === partnerHub.id
    )
  );

  const partialWaiverData = new FormData();
  partialWaiverData.set("partnerId", partner.id);
  partialWaiverData.set("amount", "10.00");
  partialWaiverData.set("reason", "Approved payment-system testing fees.");
  const partialWaiver = await waiveServiceFeeBalanceAction(
    {},
    partialWaiverData
  );
  const afterPartialWaiver = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    NOW
  );
  ok(
    "a partial waiver reduces due without pretending cash was paid",
    partialWaiver.success?.includes("₱10.00") === true &&
      afterPartialWaiver.amountDue === 5 &&
      afterPartialWaiver.paid === 30 &&
      afterPartialWaiver.waived === 10
  );

  const excessiveWaiverData = new FormData();
  excessiveWaiverData.set("partnerId", partner.id);
  excessiveWaiverData.set("amount", "5.01");
  excessiveWaiverData.set("reason", "Attempt beyond the current outstanding balance.");
  const excessiveWaiver = await waiveServiceFeeBalanceAction(
    {},
    excessiveWaiverData
  );
  ok(
    "a waiver cannot exceed the live outstanding balance",
    excessiveWaiver.errors?.amount?.includes("₱5.00") === true
  );

  const finalWaiverData = new FormData();
  finalWaiverData.set("partnerId", partner.id);
  finalWaiverData.set("amount", "5.00");
  finalWaiverData.set("reason", "Clear the remaining approved testing balance.");
  await waiveServiceFeeBalanceAction({}, finalWaiverData);
  const fullyWaived = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    NOW
  );
  ok(
    "a full waiver clears the restriction and preserves separate totals",
    fullyWaived.amountDue === 0 &&
      fullyWaived.waived === 15 &&
      fullyWaived.paid === 30 &&
      !fullyWaived.blocked &&
      serviceFeeStanding(fullyWaived) === "CURRENT"
  );

  const firstWaiver = await prisma.serviceFeeWaiver.findFirst({
    where: { partnerId: partner.id, amount: 10 },
    select: { id: true },
  });
  if (!firstWaiver) throw new Error("Expected the partial waiver fixture.");
  const reversalData = new FormData();
  reversalData.set("waiverId", firstWaiver.id);
  reversalData.set("reason", "Reverse the testing waiver after verification.");
  const reversal = await reverseServiceFeeWaiverAction({}, reversalData);
  const afterReversal = await calculateServiceFeeBalance(
    prisma,
    partner.id,
    NOW
  );
  const storedReversal = await prisma.serviceFeeWaiver.findUnique({
    where: { id: firstWaiver.id },
    select: {
      reversedAt: true,
      reversalReason: true,
      reversalBalanceBefore: true,
      reversalBalanceAfter: true,
    },
  });
  ok(
    "an audited reversal restores the waiver amount",
    reversal.success?.includes("reversed") === true &&
      afterReversal.amountDue === 10 &&
      afterReversal.waived === 5 &&
      storedReversal?.reversedAt != null &&
      Number(storedReversal.reversalBalanceBefore) === 0 &&
      Number(storedReversal.reversalBalanceAfter) === 10
  );
  const duplicateReversal = await reverseServiceFeeWaiverAction(
    {},
    reversalData
  );
  ok(
    "a waiver cannot be reversed twice",
    duplicateReversal.message === "This waiver has already been reversed."
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
