import "server-only";

import {
  Prisma,
  type PayoutEntryType,
  type PayoutNetwork,
  type PayoutRecipientKind,
  type PayoutStatus,
} from "@prisma/client";

import type { Weekday } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  addDays,
  formatManilaDate,
  formatSlotRange,
  manilaDateOf,
  manilaInstant,
  manilaWeekday,
} from "@/lib/time";

// Bunal.club collects every automatic payment and sends each venue's and
// trainer's share by manual transfer on these Asia/Manila weekdays.
const PAYOUT_WEEKDAYS: ReadonlySet<Weekday> = new Set<Weekday>(["mon", "thu"]);

const money = (value: number) => Math.round(value * 100) / 100;

// The start of the most recent payout day, in Manila. A run covers everything
// effective BEFORE this instant, so "paid up to the end of the previous day".
//
// Derived from the clock on every call rather than from a schedule: an hourly
// sweep that misses Monday 00:10 simply picks the same cutoff up at 01:10.
export function latestPayoutCutoff(now: Date = new Date()): Date {
  let date = manilaDateOf(now);
  while (!PAYOUT_WEEKDAYS.has(manilaWeekday(date))) date = addDays(date, -1);
  return manilaInstant(date, 0);
}

// The cutoff of the next run. Money effective from the latest cutoff onward
// is included here.
export function nextPayoutCutoff(now: Date = new Date()): Date {
  let date = addDays(manilaDateOf(now), 1);
  while (!PAYOUT_WEEKDAYS.has(manilaWeekday(date))) date = addDays(date, 1);
  return manilaInstant(date, 0);
}

type PayoutSource = { bookingPaymentId: string } | { trainerPaymentId: string };

type PayoutLedgerRow = {
  recipientId: string;
  recipientKind: PayoutRecipientKind;
  share: Prisma.Decimal;
  status: string;
  collectedBy: string;
  confirmed: boolean;
  paidAt: Date | null;
  refundedAt: Date | null;
  refundedAmount: Prisma.Decimal | null;
};

// Reads what the ledger needs from either kind of payment, from the row
// itself. Callers pass only an id so a stale in-memory snapshot can never
// decide how much Bunal.club owes.
async function readPayoutSource(
  tx: Prisma.TransactionClient,
  source: PayoutSource
): Promise<PayoutLedgerRow | null> {
  if ("bookingPaymentId" in source) {
    const payment = await tx.bookingPayment.findUnique({
      where: { id: source.bookingPaymentId },
      select: {
        partnerId: true,
        venueAmount: true,
        status: true,
        collectedBy: true,
        paidAt: true,
        refundedAt: true,
        refundedAmount: true,
        bookings: {
          where: { confirmedAt: { not: null } },
          take: 1,
          select: { id: true },
        },
        eventRegistration: { select: { confirmedAt: true } },
        eventGuestSlots: {
          where: { confirmedAt: { not: null } },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!payment) return null;
    return {
      recipientId: payment.partnerId,
      recipientKind: "VENUE",
      share: payment.venueAmount,
      status: payment.status,
      collectedBy: payment.collectedBy,
      // The venue earns its share only once the player actually received
      // what they paid for. A payment that lost its hold is refunded instead.
      confirmed:
        payment.bookings.length > 0 ||
        payment.eventRegistration?.confirmedAt != null ||
        payment.eventGuestSlots.length > 0,
      paidAt: payment.paidAt,
      refundedAt: payment.refundedAt,
      refundedAmount: payment.refundedAmount,
    };
  }

  const payment = await tx.trainerPayment.findUnique({
    where: { id: source.trainerPaymentId },
    select: {
      trainerId: true,
      trainerAmount: true,
      status: true,
      collectedBy: true,
      paidAt: true,
      refundedAt: true,
      refundedAmount: true,
      session: { select: { confirmedAt: true } },
    },
  });
  if (!payment) return null;
  return {
    recipientId: payment.trainerId,
    recipientKind: "TRAINER",
    share: payment.trainerAmount,
    status: payment.status,
    collectedBy: payment.collectedBy,
    confirmed: payment.session.confirmedAt != null,
    paidAt: payment.paidAt,
    refundedAt: payment.refundedAt,
    refundedAmount: payment.refundedAmount,
  };
}

function entryKey(source: PayoutSource, type: "EARNING" | "REFUND") {
  return "bookingPaymentId" in source
    ? {
        bookingPaymentId_type: {
          bookingPaymentId: source.bookingPaymentId,
          type,
        },
      }
    : {
        trainerPaymentId_type: {
          trainerPaymentId: source.trainerPaymentId,
          type,
        },
      };
}

// Records that Bunal.club owes a venue or trainer its share of a settled,
// platform-collected payment. Idempotent through the unique ledger key, and a
// no-op for every payment the platform did not collect.
export async function ensurePayoutEarning(
  tx: Prisma.TransactionClient,
  source: PayoutSource
): Promise<void> {
  const row = await readPayoutSource(tx, source);
  if (!row || row.collectedBy !== "PLATFORM") return;
  if (row.status !== "SUCCEEDED" || !row.confirmed) return;
  if (Number(row.share) <= 0) return;

  await tx.payoutEntry.upsert({
    where: entryKey(source, "EARNING"),
    create: {
      recipientId: row.recipientId,
      recipientKind: row.recipientKind,
      ...source,
      type: "EARNING",
      amount: row.share,
      effectiveAt: row.paidAt ?? new Date(),
    },
    update: {},
  });
}

// Records that an earned share went back to the player. The amount comes from
// what the payment row says was refunded, capped at the share that was earned:
// a refund that also returns Bunal.club's fee never costs the recipient more
// than they were owed. If the earning was already paid out, this entry stays
// unbatched and is deducted from the recipient's next payout.
export async function ensurePayoutRefund(
  tx: Prisma.TransactionClient,
  source: PayoutSource
): Promise<void> {
  const earning = await tx.payoutEntry.findUnique({
    where: entryKey(source, "EARNING"),
    select: { amount: true },
  });
  if (!earning) return;

  const row = await readPayoutSource(tx, source);
  if (!row || row.status !== "REFUNDED") return;
  const refunded = Math.min(
    Number(earning.amount),
    Number(row.refundedAmount ?? 0)
  );
  if (refunded <= 0) return;

  await tx.payoutEntry.upsert({
    where: entryKey(source, "REFUND"),
    create: {
      recipientId: row.recipientId,
      recipientKind: row.recipientKind,
      ...source,
      type: "REFUND",
      amount: new Prisma.Decimal(refunded).negated(),
      effectiveAt: row.refundedAt ?? new Date(),
    },
    update: {},
  });
}

// Removes ledger lines for a payment an admin is deleting outright. Refuses
// once any line is part of a payout: that money was scheduled or sent, and
// deleting its source must not quietly rewrite what a recipient was paid.
export async function releaseUnbatchedPayoutEntries(
  tx: Prisma.TransactionClient,
  source: PayoutSource
): Promise<{ ok: true } | { ok: false }> {
  const batched = await tx.payoutEntry.count({
    where: { ...source, payoutId: { not: null } },
  });
  if (batched > 0) return { ok: false };
  await tx.payoutEntry.deleteMany({ where: { ...source, payoutId: null } });
  return { ok: true };
}

export type PayoutRunResult = {
  cutoffAt: Date;
  created: number;
  // Recipients owed money for this run who have no payout account on file.
  held: number;
};

// Batches every recipient's unbatched ledger lines effective before the latest
// Monday or Thursday cutoff into one PENDING payout each.
//
// Safe to call hourly and concurrently:
//   - a recipient who already has a payout for this cutoff is skipped, so a
//     line that lands late waits for the next run;
//   - the unique (recipient, kind, cutoff) key makes a racing second run fail
//     its insert rather than double-batch;
//   - lines are locked and re-summed inside the transaction that claims them.
//
// A recipient whose lines sum to zero or less gets no payout. Their lines stay
// unbatched and are summed again next run — that is how a refund issued after
// a payout is deducted from the following one.
export async function createDuePayouts(
  now: Date = new Date()
): Promise<PayoutRunResult> {
  const cutoffAt = latestPayoutCutoff(now);
  const result: PayoutRunResult = { cutoffAt, created: 0, held: 0 };

  const groups = await prisma.payoutEntry.groupBy({
    by: ["recipientId", "recipientKind"],
    where: { payoutId: null, effectiveAt: { lt: cutoffAt } },
    _sum: { amount: true },
  });

  for (const group of groups) {
    if (Number(group._sum.amount ?? 0) <= 0) continue;
    const { recipientId, recipientKind } = group;

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const existing = await tx.payout.findUnique({
          where: {
            recipientId_recipientKind_cutoffAt: {
              recipientId,
              recipientKind,
              cutoffAt,
            },
          },
          select: { id: true },
        });
        if (existing) return "skipped" as const;

        const account = await tx.payoutAccount.findUnique({
          where: { userId: recipientId },
          select: {
            network: true,
            bankName: true,
            accountName: true,
            accountNumber: true,
          },
        });
        if (!account) return "held" as const;

        const lines = await tx.$queryRaw<
          Array<{ id: string; amount: Prisma.Decimal }>
        >(Prisma.sql`
          SELECT "id", "amount"
          FROM "PayoutEntry"
          WHERE "recipientId" = ${recipientId}
            AND "recipientKind" = ${recipientKind}::"PayoutRecipientKind"
            AND "payoutId" IS NULL
            AND "effectiveAt" < ${cutoffAt}
          FOR UPDATE
        `);
        const total = money(
          lines.reduce((sum, line) => sum + Number(line.amount), 0)
        );
        if (lines.length === 0 || total <= 0) return "skipped" as const;

        const payout = await tx.payout.create({
          data: {
            recipientId,
            recipientKind,
            cutoffAt,
            amount: new Prisma.Decimal(total),
            ...account,
          },
          select: { id: true },
        });
        const claimed = await tx.payoutEntry.updateMany({
          where: { id: { in: lines.map((line) => line.id) }, payoutId: null },
          data: { payoutId: payout.id },
        });
        // Every locked line must still be unbatched, or the payout amount no
        // longer equals the sum of its lines. Roll the whole run back.
        if (claimed.count !== lines.length) {
          throw new Error("Payout lines changed while they were being batched.");
        }
        return "created" as const;
      });
      if (outcome === "created") result.created += 1;
      if (outcome === "held") result.held += 1;
    } catch (error) {
      // Another sweep created this recipient's payout between our read and
      // our insert. Its payout stands; nothing to do.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return result;
}

// --- Views -------------------------------------------------------------------

export type PayoutAccountView = {
  network: PayoutNetwork;
  bankName: string | null;
  accountName: string;
  accountNumber: string;
  qrImage: string | null;
  updatedAt: Date;
};

export async function getPayoutAccount(
  userId: string
): Promise<PayoutAccountView | null> {
  return prisma.payoutAccount.findUnique({
    where: { userId },
    select: {
      network: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      qrImage: true,
      updatedAt: true,
    },
  });
}

export type PayoutView = {
  id: string;
  cutoffAt: Date;
  amount: number;
  status: PayoutStatus;
  network: PayoutNetwork;
  bankName: string | null;
  accountName: string;
  accountNumber: string;
  reference: string | null;
  note: string | null;
  recipientMessage: string | null;
  paidAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  earnings: number;
  refunds: number;
  lineCount: number;
};

const payoutViewSelect = {
  id: true,
  cutoffAt: true,
  amount: true,
  status: true,
  network: true,
  bankName: true,
  accountName: true,
  accountNumber: true,
  reference: true,
  note: true,
  recipientMessage: true,
  paidAt: true,
  emailedAt: true,
  createdAt: true,
  entries: { select: { type: true, amount: true } },
} as const;

type PayoutRow = Prisma.PayoutGetPayload<{ select: typeof payoutViewSelect }>;

function toPayoutView(row: PayoutRow): PayoutView {
  const { entries, amount, ...rest } = row;
  return {
    ...rest,
    amount: Number(amount),
    earnings: money(
      entries
        .filter((entry) => entry.type === "EARNING")
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
    ),
    refunds: money(
      entries
        .filter((entry) => entry.type === "REFUND")
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
    ),
    lineCount: entries.length,
  };
}

export type PayoutStatement = {
  account: PayoutAccountView | null;
  // Unbatched lines: the running total for the next payout. Negative when
  // refunds exceed new earnings and are waiting to be deducted.
  upcoming: number;
  upcomingLineCount: number;
  nextCutoffAt: Date;
  pending: PayoutView[];
  paid: PayoutView[];
  paidTotal: number;
};

// What one venue or trainer sees: where their money goes, what is building up
// for the next run, what is on its way, and what has been sent.
export async function getPayoutStatement(
  recipientId: string,
  recipientKind: PayoutRecipientKind,
  now: Date = new Date()
): Promise<PayoutStatement> {
  const [account, upcoming, pending, paid, paidTotal] = await Promise.all([
    getPayoutAccount(recipientId),
    prisma.payoutEntry.aggregate({
      where: { recipientId, recipientKind, payoutId: null },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payout.findMany({
      where: { recipientId, recipientKind, status: "PENDING" },
      orderBy: { cutoffAt: "desc" },
      select: payoutViewSelect,
    }),
    prisma.payout.findMany({
      where: { recipientId, recipientKind, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 20,
      select: payoutViewSelect,
    }),
    prisma.payout.aggregate({
      where: { recipientId, recipientKind, status: "PAID" },
      _sum: { amount: true },
    }),
  ]);

  return {
    account,
    upcoming: money(Number(upcoming._sum.amount ?? 0)),
    upcomingLineCount: upcoming._count,
    nextCutoffAt: nextPayoutCutoff(now),
    pending: pending.map(toPayoutView),
    paid: paid.map(toPayoutView),
    paidTotal: money(Number(paidTotal._sum.amount ?? 0)),
  };
}

export type AdminPayoutView = PayoutView & {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
};

const adminPayoutSelect = {
  ...payoutViewSelect,
  recipientId: true,
  recipient: { select: { name: true, email: true } },
} as const;

function toAdminPayoutView(
  row: Prisma.PayoutGetPayload<{ select: typeof adminPayoutSelect }>
): AdminPayoutView {
  const { recipient, recipientId, ...payout } = row;
  return {
    ...toPayoutView(payout),
    recipientId,
    recipientName: recipient.name ?? recipient.email,
    recipientEmail: recipient.email,
  };
}

// A payout the admin still has to send also carries the recipient's QR, read
// from their payout account rather than snapshotted. Saving the account
// re-points every pending payout in the same transaction, so the two agree;
// the QR is withheld if they ever do not, because scanning it would send the
// money somewhere other than the destination shown beside it.
export type AdminPendingPayoutView = AdminPayoutView & {
  qrImage: string | null;
};

const adminPendingPayoutSelect = {
  ...payoutViewSelect,
  recipientId: true,
  recipient: {
    select: {
      name: true,
      email: true,
      payoutAccount: {
        select: { network: true, accountNumber: true, qrImage: true },
      },
    },
  },
} as const;

function toAdminPendingPayoutView(
  row: Prisma.PayoutGetPayload<{ select: typeof adminPendingPayoutSelect }>
): AdminPendingPayoutView {
  const account = row.recipient.payoutAccount;
  return {
    ...toAdminPayoutView(row),
    qrImage:
      account != null &&
      account.network === row.network &&
      account.accountNumber === row.accountNumber
        ? account.qrImage
        : null,
  };
}

export async function listAdminPayouts(recipientKind: PayoutRecipientKind) {
  const [pending, paid] = await Promise.all([
    prisma.payout.findMany({
      where: { recipientKind, status: "PENDING" },
      orderBy: [{ cutoffAt: "asc" }, { createdAt: "asc" }],
      select: adminPendingPayoutSelect,
    }),
    prisma.payout.findMany({
      where: { recipientKind, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 50,
      select: adminPayoutSelect,
    }),
  ]);
  return {
    pending: pending.map(toAdminPendingPayoutView),
    paid: paid.map(toAdminPayoutView),
  };
}

// --- Itemised detail ----------------------------------------------------------

export type PayoutLine = {
  type: PayoutEntryType;
  // Signed: a refund is negative.
  amount: number;
  effectiveAt: Date;
  title: string;
  detail: string | null;
};

export type PayoutDetail = AdminPayoutView & {
  recipientKind: PayoutRecipientKind;
  // Manila civil date of the last day this payout covers.
  coversThrough: string;
  earningCount: number;
  lines: PayoutLine[];
};

const payoutLineSelect = {
  type: true,
  amount: true,
  effectiveAt: true,
  bookingPayment: {
    select: {
      user: { select: { name: true } },
      guestReservation: { select: { name: true } },
      bookings: {
        orderBy: { startsAt: "asc" },
        select: {
          date: true,
          startHour: true,
          endHour: true,
          court: { select: { name: true } },
          hub: { select: { name: true } },
        },
      },
      eventRegistration: {
        select: {
          event: {
            select: { title: true, date: true, hub: { select: { name: true } } },
          },
        },
      },
      eventGuestSlots: {
        select: {
          registration: {
            select: {
              event: {
                select: {
                  title: true,
                  date: true,
                  hub: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  trainerPayment: {
    select: {
      session: {
        select: {
          date: true,
          startHour: true,
          endHour: true,
          player: { select: { name: true } },
        },
      },
    },
  },
} as const;

type PayoutLineRow = Prisma.PayoutEntryGetPayload<{
  select: typeof payoutLineSelect;
}>;

const joined = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ");

// Says what a ledger line was for, in words the recipient recognises from
// their own bookings list. Every branch tolerates a missing source: the
// payment FKs are SET NULL, so a line can outlive the payment it came from.
function describePayoutLine(row: PayoutLineRow): {
  title: string;
  detail: string | null;
} {
  const payment = row.bookingPayment;
  if (payment) {
    const payer = payment.user?.name ?? payment.guestReservation?.name ?? null;

    if (payment.bookings.length > 0) {
      const courts = [
        ...new Set(payment.bookings.map((booking) => booking.court.name)),
      ].join(", ");
      const slots = [
        ...new Set(
          payment.bookings.map(
            (booking) =>
              `${formatManilaDate(booking.date)}, ${formatSlotRange(
                booking.startHour,
                booking.endHour
              )}`
          )
        ),
      ];
      const when =
        slots.length <= 2
          ? slots.join(" and ")
          : `${slots[0]} and ${slots.length - 1} more`;
      return {
        title: joined([payment.bookings[0].hub.name, courts]),
        detail: joined([when, payer]),
      };
    }

    const event =
      payment.eventRegistration?.event ??
      payment.eventGuestSlots[0]?.registration.event;
    if (event) {
      const spots =
        (payment.eventRegistration ? 1 : 0) + payment.eventGuestSlots.length;
      return {
        title: joined([event.title, event.hub.name]),
        detail: joined([
          formatManilaDate(event.date),
          `${spots} spot${spots === 1 ? "" : "s"}`,
          payer,
        ]),
      };
    }
  }

  const session = row.trainerPayment?.session;
  if (session) {
    return {
      title: `Training session with ${session.player.name ?? "a player"}`,
      detail: `${formatManilaDate(session.date)}, ${formatSlotRange(
        session.startHour,
        session.endHour
      )}`,
    };
  }

  return {
    title: "Payment no longer on record",
    detail: formatManilaDate(manilaDateOf(row.effectiveAt)),
  };
}

// One payout with everything it paid for, line by line. This is what the
// payout email is built from, so the email can only ever state what the
// ledger holds.
export async function getPayoutDetail(
  payoutId: string
): Promise<PayoutDetail | null> {
  const row = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: {
      ...adminPayoutSelect,
      recipientKind: true,
      entries: {
        orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
        select: payoutLineSelect,
      },
    },
  });
  if (!row) return null;

  const { recipientKind, entries, ...payout } = row;
  const lines = entries.map((entry) => {
    const described = describePayoutLine(entry);
    return {
      type: entry.type,
      amount: Number(entry.amount),
      effectiveAt: entry.effectiveAt,
      title:
        entry.type === "REFUND" ? `Refund · ${described.title}` : described.title,
      detail: described.detail,
    };
  });

  return {
    ...toAdminPayoutView({ ...payout, entries }),
    recipientKind,
    coversThrough: addDays(manilaDateOf(row.cutoffAt), -1),
    earningCount: lines.filter((line) => line.type === "EARNING").length,
    lines,
  };
}

export type AdminUpcomingPayout = {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  balance: number;
  lineCount: number;
  hasAccount: boolean;
};

// Balances that are not in a payout yet: money accruing for the next run,
// negative balances waiting to be recovered, and recipients who are owed
// money but have no payout account to send it to.
export async function listAdminUpcomingPayouts(
  recipientKind: PayoutRecipientKind
): Promise<AdminUpcomingPayout[]> {
  const groups = await prisma.payoutEntry.groupBy({
    by: ["recipientId"],
    where: { recipientKind, payoutId: null },
    _sum: { amount: true },
    _count: true,
  });
  if (groups.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: groups.map((group) => group.recipientId) } },
    select: {
      id: true,
      name: true,
      email: true,
      payoutAccount: { select: { id: true } },
    },
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  return groups
    .map((group) => {
      const user = byId.get(group.recipientId);
      return {
        recipientId: group.recipientId,
        recipientName: user?.name ?? user?.email ?? "Unknown account",
        recipientEmail: user?.email ?? "",
        balance: money(Number(group._sum.amount ?? 0)),
        lineCount: group._count,
        hasAccount: user?.payoutAccount != null,
      };
    })
    .filter((row) => row.balance !== 0 || !row.hasAccount)
    .sort((left, right) => right.balance - left.balance);
}

export async function pendingPayoutCount(): Promise<number> {
  return prisma.payout.count({ where: { status: "PENDING" } });
}
