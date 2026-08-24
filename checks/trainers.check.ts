// Trainer capability, scheduling, fee arithmetic, expiry, and paid messaging.
//
//   npm run check:trainers
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { addDaysTo, manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const EMAIL_PREFIX = "check-trainers-";
const FUTURE_DATE = "2099-11-10";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

async function check() {
  await cleanup();
  const [trainerUser, player, admin] = await Promise.all([
    prisma.user.create({ data: { role: "PLAYER", email: `${EMAIL_PREFIX}coach@example.com`, name: "Coach Check", playerName: "Coach Check", username: "coach-check", phone: "+639171234567", image: "https://example.com/coach.jpg" }, select: { id: true, email: true, role: true } }),
    prisma.user.create({ data: { role: "PLAYER", email: `${EMAIL_PREFIX}player@example.com`, name: "Player Check", playerName: "Player Check" }, select: { id: true, email: true, role: true } }),
    prisma.user.create({ data: { role: "ADMIN", email: `${EMAIL_PREFIX}admin@example.com`, name: "Admin Check" }, select: { id: true, email: true, role: true } }),
  ]);
  const method = await prisma.trainerManualPaymentMethod.create({ data: { trainerId: trainerUser.id, network: "GCASH", label: "Coach GCash", accountIdentifier: "09171234567" } });
  const profile = await prisma.trainerProfile.create({
    data: {
      userId: trainerUser.id,
      status: "ACTIVE",
      bio: "A trainer check profile with enough detail for public discovery.",
      sports: ["pickleball"],
      specialties: ["Fundamentals"],
      experience: "Several years of structured coaching experience.",
      area: "Quezon City",
      locationDetails: "Exact private meeting instructions",
      hourlyRate: 500,
      facebookPage: "https://www.facebook.com/coach-check",
      paymentMode: "MANUAL",
      activatedAt: new Date(),
      facebookReviewedAt: new Date(),
      weeklyRules: { create: { dayOfWeek: 2, startHour: 9, endHour: 13 } },
      exceptions: { create: [{ date: FUTURE_DATE, startHour: 10, endHour: 11, type: "UNAVAILABLE" }, { date: FUTURE_DATE, startHour: 15, endHour: 16, type: "AVAILABLE" }] },
    },
  });

  const trainers = await import("@/lib/trainers");
  ok("a ₱500 trainer hour adds a ₱15 Bunal fee", trainers.trainerServiceFeeFor(500) === 15);
  ok("trainer gross is the rate plus exactly 3%", 500 + trainers.trainerServiceFeeFor(500) === 515);
  ok("weekly hours honor unavailable and extra-available exceptions", JSON.stringify(trainers.trainerAvailableHours({ weeklyRules: [{ dayOfWeek: 2, startHour: 9, endHour: 13 }], exceptions: [{ date: FUTURE_DATE, startHour: 10, endHour: 11, type: "UNAVAILABLE" }, { date: FUTURE_DATE, startHour: 15, endHour: 16, type: "AVAILABLE" }] }, FUTURE_DATE)) === JSON.stringify([9, 11, 12, 15]));
  ok("only consecutive available whole hours can be requested", trainers.rangeAvailable([9, 10, 11], 9, 12) && !trainers.rangeAvailable([9, 11], 9, 12));
  ok("an approved, public, payment-ready trainer is discoverable", (await trainers.getPublicTrainer("coach-check"))?.id === profile.id);

  stubRequestContext(trainerUser);
  const trainerPayments = await import("@/lib/trainer-payment-actions");
  const disableOnlyMethod = new FormData();
  disableOnlyMethod.set("id", method.id);
  disableOnlyMethod.set("network", "GCASH");
  disableOnlyMethod.set("label", "Coach GCash");
  disableOnlyMethod.set("accountIdentifier", "09171234567");
  const disableOnlyResult = await trainerPayments.saveTrainerManualMethodAction(
    {},
    disableOnlyMethod
  );
  ok(
    "manual checkout keeps its final active trainer destination enabled",
    Boolean(disableOnlyResult.message) &&
      (await prisma.trainerManualPaymentMethod.findUnique({
        where: { id: method.id },
      }))?.active === true
  );

  const addMethod = new FormData();
  addMethod.set("network", "MAYA");
  addMethod.set("label", "Coach Maya");
  addMethod.set("accountName", "Coach Check");
  addMethod.set("accountIdentifier", "09181234567");
  addMethod.set("active", "on");
  const addMethodResult = await trainerPayments.saveTrainerManualMethodAction(
    {},
    addMethod
  );
  const secondMethod = await prisma.trainerManualPaymentMethod.findFirst({
    where: { trainerId: trainerUser.id, network: "MAYA" },
  });
  ok(
    "a trainer can add another manual payment destination",
    Boolean(addMethodResult.success && secondMethod)
  );

  const updateMethod = new FormData();
  updateMethod.set("id", secondMethod!.id);
  updateMethod.set("network", "MAYA");
  updateMethod.set("label", "Coach Maya Updated");
  updateMethod.set("accountName", "Coach Check");
  updateMethod.set("accountIdentifier", "09181234567");
  updateMethod.set("instructions", "Use the trainer-session public ID.");
  updateMethod.set("active", "on");
  const updateMethodResult =
    await trainerPayments.saveTrainerManualMethodAction({}, updateMethod);
  ok(
    "a trainer can modify an owned manual payment destination",
    Boolean(updateMethodResult.success) &&
      (await prisma.trainerManualPaymentMethod.findUnique({
        where: { id: secondMethod!.id },
      }))?.label === "Coach Maya Updated"
  );

  const expired = await prisma.trainerSession.create({
    data: { publicId: "check-trainer-expired", trainerProfileId: profile.id, playerId: player.id, date: FUTURE_DATE, startHour: 9, endHour: 10, hours: 1, startsAt: manilaInstant(FUTURE_DATE, 9), endsAt: manilaInstant(FUTURE_DATE, 10), hourlyRate: 500, trainerAmount: 500, platformFee: 15, totalAmount: 515, requestExpiresAt: new Date(Date.now() - 60_000), slots: { create: { trainerProfileId: profile.id, date: FUTURE_DATE, hour: 9 } } },
  });
  const swept = await trainers.sweepTrainerSessions();
  ok("the sweep expires unanswered trainer requests", swept.expired === 1 && (await prisma.trainerSession.findUnique({ where: { id: expired.id } }))?.status === "EXPIRED");
  ok("expiry releases the unique trainer hour", (await prisma.trainerSessionSlot.count({ where: { trainerSessionId: expired.id } })) === 0);

  const recoverableReview = await prisma.trainerSession.create({
    data: {
      publicId: "check-trainer-review-recovery",
      trainerProfileId: profile.id,
      playerId: player.id,
      date: FUTURE_DATE,
      startHour: 12,
      endHour: 13,
      hours: 1,
      startsAt: manilaInstant(FUTURE_DATE, 12),
      endsAt: manilaInstant(FUTURE_DATE, 13),
      status: "PAYMENT_REVIEW",
      hourlyRate: 500,
      trainerAmount: 500,
      platformFee: 15,
      totalAmount: 515,
      requestExpiresAt: new Date(Date.now() + 60_000),
      slots: {
        create: {
          trainerProfileId: profile.id,
          date: FUTURE_DATE,
          hour: 12,
        },
      },
      payment: {
        create: {
          trainerId: trainerUser.id,
          playerId: player.id,
          manualPaymentMethodId: method.id,
          manualMethodLabel: method.label,
          manualAccountDetails: method.accountIdentifier,
          amount: 515,
          trainerAmount: 500,
          platformFee: 15,
          method: "GCASH",
          collectionMode: "MANUAL",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 60_000),
          provider: "manual",
          manualSubmittedAt: new Date(),
          manualReviewedAt: new Date(),
          manualReviewedById: trainerUser.id,
        },
      },
    },
    include: { payment: true },
  });
  const approveRecoverableReview = new FormData();
  approveRecoverableReview.set("paymentId", recoverableReview.payment!.id);
  approveRecoverableReview.set("decision", "APPROVE");
  approveRecoverableReview.set("note", "Verified on retry.");
  const recoveryResult =
    await trainerPayments.reviewTrainerManualPaymentAction(
      {},
      approveRecoverableReview
    );
  const recoveredSession = await prisma.trainerSession.findUnique({
    where: { id: recoverableReview.id },
    include: { payment: true, conversation: true },
  });
  ok(
    "a timed-out manual review can be retried and confirmed atomically",
    Boolean(recoveryResult.success) &&
      recoveredSession?.status === "CONFIRMED" &&
      recoveredSession.payment?.status === "SUCCEEDED" &&
      recoveredSession.payment.manualReviewNote === "Verified on retry."
  );
  ok(
    "trainer confirmation records one service-fee charge and one conversation",
    (await prisma.trainerServiceFeeEntry.count({
      where: {
        trainerPaymentId: recoverableReview.payment!.id,
        type: "CHARGE",
      },
    })) === 1 && Boolean(recoveredSession?.conversation)
  );

  const confirmed = await prisma.trainerSession.create({
    data: { publicId: "check-trainer-confirmed", trainerProfileId: profile.id, playerId: player.id, date: FUTURE_DATE, startHour: 11, endHour: 12, hours: 1, startsAt: manilaInstant(FUTURE_DATE, 11), endsAt: manilaInstant(FUTURE_DATE, 12), status: "CONFIRMED", hourlyRate: 500, trainerAmount: 500, platformFee: 15, totalAmount: 515, requestExpiresAt: new Date(), confirmedAt: new Date(), slots: { create: { trainerProfileId: profile.id, date: FUTURE_DATE, hour: 11 } }, payment: { create: { trainerId: trainerUser.id, playerId: player.id, manualPaymentMethodId: method.id, manualMethodLabel: method.label, manualAccountDetails: method.accountIdentifier, amount: 515, trainerAmount: 500, platformFee: 15, method: "GCASH", collectionMode: "MANUAL", status: "SUCCEEDED", expiresAt: new Date(), provider: "manual", paidAt: new Date() } }, conversation: { create: { kind: "TRAINER_SESSION" } } },
  });
  stubRequestContext(player);
  const messages = await import("@/lib/messages");
  const listed = await messages.listMessageConversations();
  const room = listed?.conversations.find((item) => item.kind === "TRAINER_SESSION");
  ok("a paid trainer session creates a private player-trainer room", Boolean(room));
  const details = room ? await messages.getConversationDetails(room.id) : null;
  ok("trainer room access derives exactly two participants from the paid session", details?.participants.length === 2 && details.participants.some((member) => member.id === trainerUser.id) && details.participants.some((member) => member.id === player.id));
  ok("trainer message context points back to the trainer booking", details?.context.eyebrow === "Trainer session" && details.context.href.includes("type=trainers"));

  const deleteMethod = new FormData();
  deleteMethod.set("id", method.id);
  const deleteMethodResult =
    await trainerPayments.deleteTrainerManualMethodAction({}, deleteMethod);
  const paymentAfterDelete = await prisma.trainerPayment.findUnique({
    where: { trainerSessionId: confirmed.id },
  });
  ok(
    "a trainer can delete an owned destination when another one is enabled",
    Boolean(deleteMethodResult.success) &&
      (await prisma.trainerManualPaymentMethod.findUnique({
        where: { id: method.id },
      })) === null
  );
  ok(
    "deleting a destination preserves historical trainer payment details",
    paymentAfterDelete?.manualPaymentMethodId === null &&
      paymentAfterDelete.manualMethodLabel === "Coach GCash" &&
      paymentAfterDelete.manualAccountDetails === "09171234567"
  );

  const deleteLastMethod = new FormData();
  deleteLastMethod.set("id", secondMethod!.id);
  const deleteLastResult =
    await trainerPayments.deleteTrainerManualMethodAction({}, deleteLastMethod);
  ok(
    "manual checkout prevents deleting its final active trainer destination",
    Boolean(deleteLastResult.message) &&
      (await prisma.trainerManualPaymentMethod.findUnique({
        where: { id: secondMethod!.id },
      })) !== null
  );

  const trainerFeeEntry = await prisma.trainerServiceFeeEntry.findFirstOrThrow({
    where: { trainerId: trainerUser.id, type: "CHARGE" },
  });
  stubRequestContext(admin);
  const trainerFees = await import("@/lib/trainer-service-fees");
  const [adminBalances, adminTransactions] = await Promise.all([
    trainerFees.listAdminTrainerServiceFeeBreakdown(),
    trainerFees.listAdminTrainerServiceFeeTransactions(),
  ]);
  ok(
    "admin trainer settlements include fee balances before remittance",
    adminBalances.some(
      (item) =>
        item.trainerId === trainerUser.id && item.balance.amountDue === 15
    )
  );
  ok(
    "admin trainer settlements expose the confirmed payment transaction",
    adminTransactions.some(
      (item) =>
        item.trainerId === trainerUser.id &&
        item.id === trainerFeeEntry.id &&
        item.amount === 15
    )
  );
  await prisma.trainerServiceFeeEntry.update({
    where: { id: trainerFeeEntry.id },
    data: { createdAt: addDaysTo(new Date(), -30) },
  });
  ok(
    "an unpaid trainer fee pauses public discovery after the deadline and grace",
    (await trainerFees.isTrainerServiceFeeOverdue(trainerUser.id)) &&
      (await trainers.getPublicTrainer("coach-check")) === null
  );
  await prisma.trainerServiceFeeSettlement.create({
    data: {
      trainerId: trainerUser.id,
      periodStart: trainerFeeEntry.createdAt,
      periodEnd: new Date(),
      amount: trainerFeeEntry.amount,
      status: "PAID",
      paymentReference: "CHECK-TRAINER-SETTLED",
      reviewedAt: new Date(),
    },
  });
  ok(
    "an approved trainer settlement automatically restores public discovery",
    !(await trainerFees.isTrainerServiceFeeOverdue(trainerUser.id)) &&
      (await trainers.getPublicTrainer("coach-check"))?.id === profile.id
  );

  await prisma.user.update({ where: { id: trainerUser.id }, data: { privateProfile: true } });
  ok("making the player profile private immediately pauses trainer discovery", (await trainers.getPublicTrainer("coach-check")) === null);
  ok("the confirmed fixture remains tied to the trainer profile", confirmed.trainerProfileId === profile.id);
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
