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
  const [player, hub] = await Promise.all([
    prisma.user.findFirst({
      where: { role: "PLAYER" },
      select: { id: true },
    }),
    prisma.hub.findFirst({ select: { id: true } }),
  ]);
  if (!player || !hub) throw new Error("Seed a player and hub first.");

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
  ok("an overdue balance blocks new paid bookings", initial.blocked);
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
  stubRequestContext({ id: partner.id, email: EMAIL });
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
    "an overdue partner's hub is hidden from the public directory",
    !(await listPublicHubs()).some((listed) => listed.id === partnerHub.id)
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
  ok("submitted proof reserves its amount", submitted.pending === 30);
  ok("review time does not block bookings", !submitted.blocked);
  ok("newer fees remain due", submitted.amountDue === 15);
  ok(
    "submitted proof is shown as under review",
    serviceFeeStanding(submitted) === "UNDER_REVIEW"
  );
  const adminSubmitted = (
    await listAdminPartnerServiceFeeBreakdown(NOW)
  ).find((row) => row.partnerId === partner.id);
  ok(
    "the owner breakdown shows the same pending amount",
    adminSubmitted?.standing === "UNDER_REVIEW" &&
      adminSubmitted.balance.pending === submitted.pending
  );
  ok(
    "submitted proof restores public visibility during review",
    (await listPublicHubs()).some((listed) => listed.id === partnerHub.id)
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
    !(await listPublicHubs()).some((listed) => listed.id === partnerHub.id)
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
  ok("a refund reverses its service fee", refunded.earned === 30);
  ok("the approved remittance clears the balance", refunded.amountDue === 0);
  ok("a cleared balance does not block bookings", !refunded.blocked);
  ok(
    "a paid balance is current",
    serviceFeeStanding(refunded) === "CURRENT"
  );
  const adminCurrent = (
    await listAdminPartnerServiceFeeBreakdown(NOW)
  ).find((row) => row.partnerId === partner.id);
  ok(
    "the owner breakdown shows the cleared balance and latest payment",
    adminCurrent?.standing === "CURRENT" &&
      adminCurrent.balance.amountDue === 0 &&
      adminCurrent.lastPaidAmount === 30
  );
  ok(
    "a cleared balance keeps the hub publicly visible",
    (await listPublicHubs()).some((listed) => listed.id === partnerHub.id)
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
