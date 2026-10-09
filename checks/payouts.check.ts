// What Bunal.club owes venues, and the Monday and Thursday run that pays it.
//
//   npm run check:payouts
//
// What it is really guarding: that a venue is paid exactly its share exactly
// once, that a refund after a payout comes off the next one rather than
// vanishing, and that two sweeps landing together cannot pay anyone twice.
//
// Unlike other checks, the fixtures here are dated in the far PAST. A payout
// run batches every unbatched ledger line before its cutoff, for every
// recipient, so running one in the future would sweep up real balances. A run
// in January 2001 can only ever see this check's own lines.
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";

const prisma = new PrismaClient();

const PARTNER_EMAIL = "check-payout-partner@example.test";
const DATE = "2099-12-27";

// 1 January 2001 was a Monday, so the runs fall on Jan 1, 4, 8, and 11.
const manila = (date: string, hour = 0) =>
  new Date(Date.parse(`${date}T00:00:00+08:00`) + hour * 3_600_000);

async function check() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  const court = await prisma.court.findFirst({
    select: {
      id: true,
      hubId: true,
      name: true,
      hub: { select: { name: true } },
    },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  if (!admin || !court || !player) {
    throw new Error("Seed a player, hub, and admin first.");
  }

  // One mutable actor: the stubbed session returns this object, so changing
  // its fields switches who is signed in between phases.
  const actor: {
    id: string;
    email: string;
    role: string;
    partnerStatus: string | null;
    name: string | null;
  } = {
    id: admin.id,
    email: admin.email,
    role: "ADMIN",
    partnerStatus: null,
    name: "Check Admin",
  };
  stubRequestContext(actor, { stubPublicRequest: true });

  const {
    createDuePayouts,
    ensurePayoutEarning,
    ensurePayoutRefund,
    getPayoutDetail,
    getPayoutStatement,
    latestPayoutCutoff,
    nextPayoutCutoff,
    releaseUnbatchedPayoutEntries,
  } = await import("@/lib/payouts");
  const {
    markPayoutPaidAction,
    previewPayoutEmailAction,
    resendPayoutEmailAction,
    savePayoutAccountAction,
  } = await import("@/lib/payout-actions");

  // --- 1. The schedule ------------------------------------------------------
  const cutoffs: Array<[string, number, string]> = [
    // [Manila date, hour, expected cutoff date]
    ["2001-01-01", 0, "2001-01-01"], // Monday, the instant it begins
    ["2001-01-01", 10, "2001-01-01"], // Monday
    ["2001-01-02", 10, "2001-01-01"], // Tuesday
    ["2001-01-03", 23, "2001-01-01"], // Wednesday
    ["2001-01-04", 1, "2001-01-04"], // Thursday
    ["2001-01-05", 10, "2001-01-04"], // Friday
    ["2001-01-06", 10, "2001-01-04"], // Saturday
    ["2001-01-07", 23, "2001-01-04"], // Sunday
    ["2001-01-08", 0, "2001-01-08"], // the next Monday
  ];
  ok(
    "every weekday resolves to the most recent Monday or Thursday in Manila",
    cutoffs.every(
      ([date, hour, expected]) =>
        latestPayoutCutoff(manila(date, hour)).getTime() ===
        manila(expected).getTime()
    )
  );
  ok(
    "a late-Sunday UTC instant that is already Monday in Manila counts as Monday",
    latestPayoutCutoff(new Date("2000-12-31T16:30:00Z")).getTime() ===
      manila("2001-01-01").getTime()
  );
  ok(
    "the next run after a Monday is Thursday, and after a Thursday is Monday",
    nextPayoutCutoff(manila("2001-01-01", 10)).getTime() ===
      manila("2001-01-04").getTime() &&
      nextPayoutCutoff(manila("2001-01-04", 10)).getTime() ===
        manila("2001-01-08").getTime()
  );

  // --- 2. The ledger --------------------------------------------------------
  await cleanup();
  const baselinePayments = await prisma.bookingPayment.count();
  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      name: "Payout Check Venue",
      email: PARTNER_EMAIL,
      passwordHash: "x",
    },
    select: { id: true },
  });

  let hour = 0;
  const pay = async (
    venueAmount: number,
    paidAt: Date,
    opts: { collectedBy?: "PLATFORM" | "DIRECT"; confirmed?: boolean } = {}
  ) => {
    const payment = await prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        collectedBy: opts.collectedBy ?? "PLATFORM",
        userId: player.id,
        hubId: court.hubId,
        amount: venueAmount + 25,
        venueAmount,
        platformFee: 25,
        processingFeeResponsibility: "BUNAL",
        method: "QRPH",
        // DIRECT + AUTOMATIC would need a gateway; a manual row stands in for
        // "money Bunal.club never held".
        collectionMode: opts.collectedBy === "DIRECT" ? "MANUAL" : "AUTOMATIC",
        status: "SUCCEEDED",
        expiresAt: paidAt,
        provider: "paymongo",
        paidAt,
      },
      select: { id: true },
    });
    const startHour = hour++ % 23;
    await prisma.booking.create({
      data: {
        courtId: court.id,
        hubId: court.hubId,
        userId: player.id,
        date: DATE,
        startHour,
        endHour: startHour + 1,
        hours: 1,
        startsAt: new Date(`${DATE}T00:00:00.000Z`),
        endsAt: new Date(`${DATE}T01:00:00.000Z`),
        status: opts.confirmed === false ? "PENDING" : "CONFIRMED",
        confirmedAt: opts.confirmed === false ? null : paidAt,
        bookingPaymentId: payment.id,
      },
    });
    return payment.id;
  };
  const earn = (bookingPaymentId: string) =>
    prisma.$transaction((tx) => ensurePayoutEarning(tx, { bookingPaymentId }));
  const refund = async (
    bookingPaymentId: string,
    refundedAmount: number,
    refundedAt: Date
  ) => {
    await prisma.bookingPayment.update({
      where: { id: bookingPaymentId },
      data: { status: "REFUNDED", refundedAmount, refundedAt },
    });
    await prisma.$transaction((tx) =>
      ensurePayoutRefund(tx, { bookingPaymentId })
    );
  };
  const entries = (bookingPaymentId: string) =>
    prisma.payoutEntry.findMany({
      where: { bookingPaymentId },
      orderBy: { createdAt: "asc" },
    });

  const first = await pay(500, manila("2000-12-30", 12));
  await earn(first);
  await earn(first);
  const firstEntries = await entries(first);
  ok(
    "a settled platform payment earns the venue its share exactly once",
    firstEntries.length === 1 &&
      firstEntries[0].type === "EARNING" &&
      Number(firstEntries[0].amount) === 500 &&
      firstEntries[0].recipientKind === "VENUE" &&
      firstEntries[0].recipientId === partner.id
  );
  ok(
    "the earning is dated when the player paid, not when it was recorded",
    firstEntries[0].effectiveAt.getTime() === manila("2000-12-30", 12).getTime()
  );

  const direct = await pay(700, manila("2000-12-30", 13), {
    collectedBy: "DIRECT",
  });
  await earn(direct);
  ok(
    "money the venue collected itself is never owed back as a payout",
    (await entries(direct)).length === 0
  );

  const unconfirmed = await pay(900, manila("2000-12-30", 14), {
    confirmed: false,
  });
  await earn(unconfirmed);
  ok(
    "a paid checkout whose booking was never confirmed earns nothing",
    (await entries(unconfirmed)).length === 0
  );

  // --- 3. The Monday run ----------------------------------------------------
  const monday = manila("2001-01-01", 2);
  const second = await pay(300, manila("2001-01-02", 9));
  await earn(second);

  const held = await createDuePayouts(monday);
  ok(
    "a venue with no payout account is held, not paid",
    held.created === 0 &&
      held.held === 1 &&
      (await prisma.payout.count({ where: { recipientId: partner.id } })) === 0
  );

  await prisma.payoutAccount.create({
    data: {
      userId: partner.id,
      network: "GCASH",
      accountName: "Payout Check Venue",
      accountNumber: "09171234567",
    },
  });
  const [runA, runB] = await Promise.all([
    createDuePayouts(monday),
    createDuePayouts(monday),
  ]);
  const mondayPayouts = await prisma.payout.findMany({
    where: { recipientId: partner.id },
    include: { entries: true },
  });
  ok(
    "two sweeps landing together create exactly one payout",
    runA.created + runB.created === 1 && mondayPayouts.length === 1
  );
  const mondayPayout = mondayPayouts[0];
  ok(
    "the payout covers only payments made before Monday began",
    Number(mondayPayout.amount) === 500 &&
      mondayPayout.entries.length === 1 &&
      mondayPayout.entries[0].bookingPaymentId === first &&
      mondayPayout.cutoffAt.getTime() === manila("2001-01-01").getTime()
  );
  ok(
    "it starts PENDING with the destination snapshotted",
    mondayPayout.status === "PENDING" &&
      mondayPayout.network === "GCASH" &&
      mondayPayout.accountNumber === "09171234567" &&
      mondayPayout.reference === null
  );
  ok(
    "running the same day again creates nothing new",
    (await createDuePayouts(monday)).created === 0 &&
      (await prisma.payout.count({ where: { recipientId: partner.id } })) === 1
  );

  // A payment made before the cutoff whose ledger line only lands afterwards
  // — a webhook that arrived late — must wait rather than reopen a payout.
  const late = await pay(150, manila("2000-12-31", 20));
  await earn(late);
  ok(
    "a line that lands after its run waits for the next one",
    (await createDuePayouts(monday)).created === 0 &&
      (await entries(late))[0].payoutId === null
  );

  // --- 4. Recording the transfer -------------------------------------------
  const paidForm = (reference: string, message = "") => {
    const form = new FormData();
    form.set("payoutId", mondayPayout.id);
    form.set("reference", reference);
    form.set("message", message);
    return form;
  };
  const markedEvents = () =>
    prisma.securityEvent.count({
      where: {
        type: "ADMIN_PAYOUT_MARKED_PAID",
        metadata: { path: ["payoutId"], equals: mondayPayout.id },
      },
    });

  // The email is built from the ledger, line by line.
  const mondayDetail = await getPayoutDetail(mondayPayout.id);
  ok(
    "a payout's detail names what each line paid for",
    mondayDetail !== null &&
      mondayDetail.lines.length === 1 &&
      mondayDetail.lines[0].type === "EARNING" &&
      mondayDetail.lines[0].amount === 500 &&
      mondayDetail.lines[0].title === `${court.hub.name} · ${court.name}` &&
      mondayDetail.earningCount === 1 &&
      // Monday's run covers payments up to the end of Sunday.
      mondayDetail.coversThrough === "2000-12-31"
  );

  const previewNoReference = await previewPayoutEmailAction({}, paidForm(""));
  ok(
    "the email cannot be previewed without a transfer reference",
    Boolean(previewNoReference.errors?.reference) && !previewNoReference.preview
  );
  const previewed = await previewPayoutEmailAction(
    {},
    paidForm("GC-REF-0001", "Salamat <b>po</b>")
  );
  ok(
    "the preview is the email: exact amount, reference, and masked account",
    previewed.preview?.to === PARTNER_EMAIL &&
      previewed.preview.subject === "Your ₱500.00 Bunal.club payout was sent" &&
      previewed.preview.html.includes("₱500.00") &&
      previewed.preview.html.includes("GC-REF-0001") &&
      previewed.preview.html.includes("GCash · Payout Check Venue · •••• 4567") &&
      !previewed.preview.html.includes("09171234567") &&
      previewed.preview.html.includes(`${court.hub.name} · ${court.name}`
        .replaceAll("&", "&amp;")
        .replaceAll("'", "&#39;"))
  );
  ok(
    "the admin's message is included, escaped",
    previewed.preview?.html.includes("Salamat &lt;b&gt;po&lt;/b&gt;") === true &&
      previewed.preview.recipientMessage === "Salamat <b>po</b>"
  );
  ok(
    "previewing records nothing: still pending, not audited",
    (await prisma.payout.findUnique({ where: { id: mondayPayout.id } }))!
      .status === "PENDING" && (await markedEvents()) === 0
  );
  const resendForm = new FormData();
  resendForm.set("payoutId", mondayPayout.id);
  const earlyResend = await resendPayoutEmailAction({}, resendForm);
  ok(
    "a payout that has not been sent cannot be emailed as sent",
    !earlyResend.success && Boolean(earlyResend.message)
  );
  const noReference = await markPayoutPaidAction({}, paidForm("  "));
  ok(
    "a payout cannot be recorded without a transfer reference",
    Boolean(noReference.errors?.reference) &&
      (await prisma.payout.findUnique({ where: { id: mondayPayout.id } }))!
        .status === "PENDING"
  );
  const marked = await markPayoutPaidAction(
    {},
    paidForm("GC-REF-0001", "Salamat <b>po</b>")
  );
  const afterMark = await prisma.payout.findUnique({
    where: { id: mondayPayout.id },
  });
  ok(
    "an admin records the transfer with its reference",
    Boolean(marked.success) &&
      afterMark!.status === "PAID" &&
      afterMark!.reference === "GC-REF-0001" &&
      afterMark!.paidAt !== null &&
      afterMark!.paidById === admin.id
  );
  // The fixture address is on the reserved .test TLD, so nothing is sent.
  ok(
    "the admin is told the email did not go out, and it is not marked emailed",
    marked.email === (process.env.RESEND_API_KEY?.trim() &&
    process.env.EMAIL_FROM?.trim()
      ? "undeliverable"
      : "not-configured") &&
      marked.success?.includes("No email was sent") === true &&
      afterMark!.emailedAt === null
  );
  ok(
    "the message to the recipient is kept for a resend",
    afterMark!.recipientMessage === "Salamat <b>po</b>" &&
      afterMark!.note === null
  );
  const lateResend = await resendPayoutEmailAction({}, resendForm);
  ok(
    "resending a sent payout reports the same delivery outcome",
    !lateResend.success &&
      lateResend.message?.includes("No email was sent") === true &&
      (await prisma.payout.findUnique({ where: { id: mondayPayout.id } }))!
        .emailedAt === null
  );
  const latePreview = await previewPayoutEmailAction(
    {},
    paidForm("GC-REF-0009")
  );
  ok(
    "a payout already sent cannot be previewed with a different reference",
    !latePreview.preview && Boolean(latePreview.message)
  );
  const markedAgain = await markPayoutPaidAction({}, paidForm("GC-REF-0002"));
  ok(
    "recording it twice changes nothing",
    !markedAgain.success &&
      (await prisma.payout.findUnique({ where: { id: mondayPayout.id } }))!
        .reference === "GC-REF-0001"
  );
  ok("and the action is audited once", (await markedEvents()) === 1);

  // --- 5. The Thursday run --------------------------------------------------
  const thursday = manila("2001-01-04", 1);
  ok(
    "Thursday pays everything since, including the late line",
    (await createDuePayouts(thursday)).created === 1
  );
  const thursdayPayout = await prisma.payout.findFirst({
    where: { recipientId: partner.id, cutoffAt: manila("2001-01-04") },
    include: { entries: true },
  });
  ok(
    "and its amount is the sum of its lines",
    Number(thursdayPayout!.amount) === 450 &&
      thursdayPayout!.entries.reduce(
        (sum, entry) => sum + Number(entry.amount),
        0
      ) === 450
  );

  // --- 6. A refund after the payout ----------------------------------------
  // The venue was already paid ₱500 for `first`. Refunding it now cannot
  // claw that back; it has to come off what the venue earns next.
  await refund(first, 500, manila("2001-01-05", 10));
  await refund(first, 500, manila("2001-01-05", 10));
  const firstAfterRefund = await entries(first);
  ok(
    "a refund writes one negative line and leaves the paid-out earning alone",
    firstAfterRefund.length === 2 &&
      Number(firstAfterRefund[1].amount) === -500 &&
      firstAfterRefund[1].payoutId === null &&
      firstAfterRefund[0].payoutId === mondayPayout.id
  );

  const third = await pay(200, manila("2001-01-06", 10));
  await earn(third);
  const secondMonday = await createDuePayouts(manila("2001-01-08", 1));
  ok(
    "a balance that is still negative creates no payout",
    secondMonday.created === 0 &&
      (await prisma.payout.count({ where: { recipientId: partner.id } })) === 2 &&
      (await entries(third))[0].payoutId === null
  );
  const statement = await getPayoutStatement(
    partner.id,
    "VENUE",
    manila("2001-01-08", 1)
  );
  ok(
    "the venue's statement shows what is still to be deducted",
    statement.upcoming === -300 &&
      statement.paidTotal === 500 &&
      statement.pending.length === 1
  );

  const fourth = await pay(400, manila("2001-01-09", 10));
  await earn(fourth);
  ok(
    "once earnings pass the refund, the next run pays the difference",
    (await createDuePayouts(manila("2001-01-11", 1))).created === 1
  );
  const recovered = await prisma.payout.findFirst({
    where: { recipientId: partner.id, cutoffAt: manila("2001-01-11") },
    include: { entries: true },
  });
  ok(
    "the refund was deducted in full: 200 + 400 − 500",
    Number(recovered!.amount) === 100 && recovered!.entries.length === 3
  );
  const recoveredDetail = await getPayoutDetail(recovered!.id);
  const refundLine = recoveredDetail!.lines.find(
    (line) => line.type === "REFUND"
  );
  ok(
    "its detail shows the refund as a negative line and still adds up",
    recoveredDetail!.lines.length === 3 &&
      refundLine?.amount === -500 &&
      refundLine.title.startsWith("Refund · ") &&
      recoveredDetail!.earnings === 600 &&
      recoveredDetail!.refunds === -500 &&
      recoveredDetail!.lines.reduce((sum, line) => sum + line.amount, 0) ===
        recoveredDetail!.amount
  );

  // A refund that also returns Bunal.club's fee never costs the venue more
  // than the share it was owed.
  const fifth = await pay(250, manila("2001-01-12", 10));
  await earn(fifth);
  await refund(fifth, 275, manila("2001-01-12", 12));
  ok(
    "a refund larger than the venue's share is capped at that share",
    Number((await entries(fifth))[1].amount) === -250
  );

  // --- 6b. Deleting a payment ----------------------------------------------
  const blocked = await prisma.$transaction((tx) =>
    releaseUnbatchedPayoutEntries(tx, { bookingPaymentId: second })
  );
  ok(
    "a payment already in a payout cannot have its lines released",
    !blocked.ok && (await entries(second)).length === 1
  );
  const released = await prisma.$transaction((tx) =>
    releaseUnbatchedPayoutEntries(tx, { bookingPaymentId: fifth })
  );
  ok(
    "a payment not yet in any payout releases its lines",
    released.ok && (await entries(fifth)).length === 0
  );

  // --- 7. Changing the payout account --------------------------------------
  actor.id = partner.id;
  actor.email = PARTNER_EMAIL;
  actor.role = "PARTNER";
  actor.partnerStatus = "ACTIVE";

  const accountForm = (values: Record<string, string>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  };
  const missingBank = await savePayoutAccountAction(
    {},
    accountForm({
      network: "BANK_TRANSFER",
      accountName: "Payout Check Venue",
      accountNumber: "001234567890",
    })
  );
  ok("a bank payout needs a bank name", Boolean(missingBank.errors?.bankName));
  const badMobile = await savePayoutAccountAction(
    {},
    accountForm({
      network: "MAYA",
      accountName: "Payout Check Venue",
      accountNumber: "12345",
    })
  );
  ok(
    "an e-wallet payout needs a full mobile number",
    Boolean(badMobile.errors?.accountNumber)
  );
  ok(
    "a rejected form leaves the account unchanged",
    (await prisma.payoutAccount.findUnique({ where: { userId: partner.id } }))!
      .accountNumber === "09171234567"
  );

  const saved = await savePayoutAccountAction(
    {},
    accountForm({
      network: "BANK_TRANSFER",
      bankName: "BDO",
      accountName: "Payout Check Venue Inc",
      accountNumber: "0012 3456 7890",
    })
  );
  const account = await prisma.payoutAccount.findUnique({
    where: { userId: partner.id },
  });
  ok(
    "the owner can change where payouts go",
    Boolean(saved.success) &&
      account!.network === "BANK_TRANSFER" &&
      account!.bankName === "BDO" &&
      account!.accountNumber === "001234567890" &&
      account!.updatedById === partner.id
  );
  const repointed = await prisma.payout.findMany({
    where: { recipientId: partner.id },
    select: { status: true, accountNumber: true, network: true },
  });
  ok(
    "payouts that have not been sent yet follow the new account",
    repointed
      .filter((payout) => payout.status === "PENDING")
      .every(
        (payout) =>
          payout.accountNumber === "001234567890" &&
          payout.network === "BANK_TRANSFER"
      ) && repointed.some((payout) => payout.status === "PENDING")
  );
  ok(
    "a payout that was already sent keeps the account it was sent to",
    repointed
      .filter((payout) => payout.status === "PAID")
      .every((payout) => payout.accountNumber === "09171234567")
  );

  await cleanup();
  ok(
    "the real payments are untouched",
    (await prisma.bookingPayment.count()) === baselinePayments
  );
}

async function cleanup() {
  const partner = await prisma.user.findUnique({
    where: { email: PARTNER_EMAIL },
    select: { id: true },
  });
  if (!partner) return;
  await prisma.securityEvent.deleteMany({
    where: {
      type: "ADMIN_PAYOUT_MARKED_PAID",
      metadata: { path: ["recipientId"], equals: partner.id },
    },
  });
  await prisma.booking.deleteMany({
    where: { bookingPayment: { partnerId: partner.id } },
  });
  // Lines reference their payout with NO ACTION, so they go first.
  await prisma.payoutEntry.deleteMany({ where: { recipientId: partner.id } });
  await prisma.payout.deleteMany({ where: { recipientId: partner.id } });
  await prisma.bookingPayment.deleteMany({ where: { partnerId: partner.id } });
  await prisma.user.delete({ where: { id: partner.id } });
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
