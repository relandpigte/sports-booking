// Overdue service-fee reminders are automatic, throttled, and retryable.
//
//   npm run check:settlement-notifications
import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import { ensureServiceFeeCharge } from "@/lib/service-fees";
import { addDaysTo } from "@/lib/time";

const prisma = new PrismaClient();
const EMAIL = "check-overdue-settlement@example.test";
const NOW = new Date("2026-07-30T04:00:00Z");

type CapturedRequest = {
  body: Record<string, unknown>;
  headers: Headers;
  failed: boolean;
};

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
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

    const first = await sweep(NOW);
    const duplicate = await sweep(NOW);
    const tooSoon = await sweep(addDaysTo(NOW, 6));
    const weekly = await sweep(addDaysTo(NOW, 8));

    ok("the first overdue sweep sends one partner reminder", first.sent === 1);
    ok(
      "repeat and early sweeps cannot resend the reminder",
      duplicate.sent === 0 && tooSoon.sent === 0 && requests.length === 2
    );
    ok("an unresolved balance receives a weekly reminder", weekly.sent === 1);
    ok(
      "the reminder contains the overdue amount and settlement action",
      String(requests[0]?.body.html).includes("₱30.00") &&
        String(requests[0]?.body.html).includes("/dashboard/payments") &&
        JSON.stringify(requests[0]?.body.tags).includes(
          "partner-service-fee-overdue"
        )
    );
    ok(
      "partner-provided names are escaped in reminder HTML",
      String(requests[0]?.body.html).includes("Settlement &lt;Owner&gt;") &&
        !String(requests[0]?.body.html).includes("Settlement <Owner>")
    );
    ok(
      "weekly reminders use different stable idempotency periods",
      requests[0]?.headers.get("Idempotency-Key") !==
        requests[1]?.headers.get("Idempotency-Key")
    );

    failNext = true;
    const failedAt = addDaysTo(NOW, 16);
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
          addDaysTo(NOW, 8).getTime()
    );
    ok(
      "the next sweep retries a failed notification",
      retried.sent === 1 && requests.length === 4
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
    const covered = await sweep(addDaysTo(NOW, 24));
    ok(
      "submitted settlement proof stops overdue reminders",
      covered.sent === 0 && requests.length === 4
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
