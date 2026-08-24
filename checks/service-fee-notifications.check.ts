// Overdue service-fee reminders are automatic, throttled, and retryable.
//
//   npm run check:settlement-notifications
import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import { ensureServiceFeeCharge } from "@/lib/service-fees";
import { addDaysTo } from "@/lib/time";

const prisma = new PrismaClient();
const EMAIL = "check-overdue-settlement@example.test";
const TRAINER_EMAIL = "check-overdue-trainer@example.test";
const NOW = new Date("2026-07-30T04:00:00Z");

type CapturedRequest = {
  body: Record<string, unknown>;
  headers: Headers;
  failed: boolean;
};

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL, TRAINER_EMAIL] } },
  });
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
      name: "Settlement <Owner>",
      email: EMAIL,
      passwordHash: "x",
    },
    select: { id: true },
  });
  const payment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      userId: player.id,
      hubId: hub.id,
      amount: 530,
      venueAmount: 500,
      platformFee: 30,
      method: "GCASH",
      status: "SUCCEEDED",
      provider: "paymongo",
      expiresAt: new Date("2026-07-10T04:15:00Z"),
      paidAt: new Date("2026-07-10T04:00:00Z"),
    },
    select: {
      id: true,
      partnerId: true,
      platformFee: true,
      paidAt: true,
    },
  });
  await prisma.$transaction((tx) => ensureServiceFeeCharge(tx, payment));

  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalAppUrl = process.env.APP_URL;
  const originalFetch = globalThis.fetch;
  const requests: CapturedRequest[] = [];
  let failNext = false;

  process.env.RESEND_API_KEY = "re_service_fee_notification_check_only";
  process.env.EMAIL_FROM = "Bunal.club <check@example.test>";
  process.env.APP_URL = "https://www.bunal.club";
  globalThis.fetch = (async (_input, init) => {
    const request = {
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
      failed: failNext,
    };
    requests.push(request);
    if (failNext) {
      failNext = false;
      throw new Error("Simulated email outage");
    }
    return new Response(JSON.stringify({ id: `overdue-${requests.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { notifyPartnersOfOverdueServiceFees } = await import(
      "@/lib/service-fee-notifications"
    );
    const sweep = (date: Date) =>
      notifyPartnersOfOverdueServiceFees(date, { partnerIds: [partner.id] });

    const beforeWindow = await sweep(new Date("2026-07-18T04:00:00Z"));
    const dueTomorrow = await sweep(new Date("2026-07-19T04:00:00Z"));
    const dueDay = await sweep(new Date("2026-07-20T04:00:00Z"));
    const dueDayDuplicate = await sweep(new Date("2026-07-20T04:00:00Z"));
    const tooSoon = await sweep(new Date("2026-07-21T03:00:00Z"));
    const daily = await sweep(new Date("2026-07-21T04:00:00Z"));
    const blocked = await sweep(NOW);
    const blockedDuplicate = await sweep(NOW);
    const blockedDaily = await sweep(addDaysTo(NOW, 1));

    ok(
      "partners are not emailed before the one-day reminder window",
      beforeWindow.sent === 0 && requests.length === 5
    );
    ok(
      "partners receive a clear reminder one day before settlement is due",
      dueTomorrow.sent === 1 &&
        String(requests[0]?.body.subject).includes("due tomorrow") &&
        String(requests[0]?.body.html).includes("three-day grace period")
    );
    ok(
      "the due-day sweep sends the first overdue reminder",
      dueDay.sent === 1 &&
        String(requests[1]?.body.html).includes("three-day enforcement grace")
    );
    ok(
      "same-day and sub-24-hour sweeps cannot duplicate a reminder",
      dueDayDuplicate.sent === 0 && tooSoon.sent === 0
    );
    ok(
      "an unresolved balance receives one reminder every day",
      daily.sent === 1 &&
        blocked.sent === 1 &&
        blockedDuplicate.sent === 0 &&
        blockedDaily.sent === 1 &&
        requests.length === 5
    );
    ok(
      "the overdue reminder contains the amount and settlement action",
      String(requests[3]?.body.html).includes("₱30.00") &&
        String(requests[3]?.body.html).includes("/dashboard/payments") &&
        JSON.stringify(requests[3]?.body.tags).includes(
          "partner-service-fee-overdue"
        )
    );
    ok(
      "partner-provided names are escaped in reminder HTML",
      String(requests[3]?.body.html).includes("Settlement &lt;Owner&gt;") &&
        !String(requests[3]?.body.html).includes("Settlement <Owner>")
    );
    ok(
      "daily reminders use different stable idempotency dates",
      requests[3]?.headers.get("Idempotency-Key") !==
        requests[4]?.headers.get("Idempotency-Key")
    );

    failNext = true;
    const failedAt = addDaysTo(NOW, 2);
    const failed = await sweep(failedAt);
    const afterFailure = await prisma.user.findUnique({
      where: { id: partner.id },
      select: { serviceFeeReminderAt: true },
    });
    const retried = await sweep(failedAt);
    ok(
      "a provider failure releases the notification claim",
      failed.failed === 1 &&
        afterFailure?.serviceFeeReminderAt?.getTime() ===
          addDaysTo(NOW, 1).getTime()
    );
    ok(
      "the next sweep retries a failed notification",
      retried.sent === 1 && requests.length === 7
    );

    await prisma.serviceFeeSettlement.create({
      data: {
        partnerId: partner.id,
        periodStart: payment.paidAt ?? NOW,
        periodEnd: NOW,
        amount: 30,
        paymentReference: "CHECK-NOTIFIED",
        receiptImage: "data:image/png;base64,YQ==",
      },
    });
    const covered = await sweep(addDaysTo(NOW, 3));
    ok(
      "submitted settlement proof stops overdue reminders",
      covered.sent === 0 && requests.length === 7
    );

    const trainer = await prisma.user.create({
      data: {
        role: "PLAYER",
        name: "Trainer <Coach>",
        playerName: "Trainer <Coach>",
        email: TRAINER_EMAIL,
        trainerProfile: {
          create: {
            status: "ACTIVE",
            sports: ["pickleball"],
            specialties: [],
            activatedAt: new Date("2026-07-01T04:00:00Z"),
          },
        },
      },
      select: { id: true },
    });
    const session = await prisma.trainerSession.create({
      data: {
        publicId: "check-overdue-trainer-session",
        trainerProfileId: (
          await prisma.trainerProfile.findUniqueOrThrow({
            where: { userId: trainer.id },
            select: { id: true },
          })
        ).id,
        playerId: player.id,
        date: "2026-07-10",
        startHour: 9,
        endHour: 10,
        hours: 1,
        startsAt: new Date("2026-07-10T01:00:00Z"),
        endsAt: new Date("2026-07-10T02:00:00Z"),
        status: "CONFIRMED",
        hourlyRate: 1000,
        trainerAmount: 1000,
        platformFee: 30,
        totalAmount: 1030,
        requestExpiresAt: new Date("2026-07-10T00:00:00Z"),
        confirmedAt: new Date("2026-07-10T04:00:00Z"),
      },
      select: { id: true },
    });
    const trainerPayment = await prisma.trainerPayment.create({
      data: {
        trainerSessionId: session.id,
        trainerId: trainer.id,
        playerId: player.id,
        amount: 1030,
        trainerAmount: 1000,
        platformFee: 30,
        method: "GCASH",
        status: "SUCCEEDED",
        expiresAt: new Date("2026-07-10T04:15:00Z"),
        provider: "manual",
        paidAt: new Date("2026-07-10T04:00:00Z"),
      },
      select: { id: true },
    });
    await prisma.trainerServiceFeeEntry.create({
      data: {
        trainerId: trainer.id,
        trainerPaymentId: trainerPayment.id,
        type: "CHARGE",
        amount: 30,
        createdAt: new Date("2026-07-10T04:00:00Z"),
      },
    });

    const { notifyTrainersOfOverdueServiceFees } = await import(
      "@/lib/service-fee-notifications"
    );
    const trainerGrace = await notifyTrainersOfOverdueServiceFees(
      new Date("2026-07-21T04:00:00Z"),
      { trainerIds: [trainer.id] }
    );
    const trainerBlocked = await notifyTrainersOfOverdueServiceFees(NOW, {
      trainerIds: [trainer.id],
    });
    ok(
      "trainer reminders explain the grace-period discovery deadline",
      trainerGrace.sent === 1 &&
        String(requests[7]?.body.html).includes(
          "trainer profile remains available"
        )
    );
    ok(
      "overdue trainers receive the trainer payment action and pause copy",
      trainerBlocked.sent === 1 &&
        String(requests[8]?.body.html).includes(
          "public trainer visibility are paused"
        ) &&
        String(requests[8]?.body.html).includes(
          "/dashboard/trainer/payments"
        ) &&
        JSON.stringify(requests[8]?.body.tags).includes(
          "trainer-service-fee-overdue"
        )
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  }
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
