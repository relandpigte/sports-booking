import "server-only";

import { Prisma, type ServiceFeeSettlementStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  addDays,
  addDaysTo,
  manilaDateOf,
  manilaInstant,
  manilaWeekday,
} from "@/lib/time";

const WEEKDAY_OFFSET = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
} as const;

const money = (value: number) => Math.round(value * 100) / 100;

type FeeDb = Pick<
  Prisma.TransactionClient,
  "serviceFeeEntry" | "serviceFeeSettlement"
>;

export const SERVICE_FEE_GRACE_DAYS = 7;

export function serviceFeeWeekStart(now: Date = new Date()): Date {
  const today = manilaDateOf(now);
  const monday = addDays(today, -WEEKDAY_OFFSET[manilaWeekday(today)]);
  return manilaInstant(monday, 0);
}

// Fees from the previous Monday-Sunday period become overdue one week after
// that period closes. Entries before this instant have crossed that deadline.
export function serviceFeeOverdueCutoff(now: Date = new Date()): Date {
  return addDaysTo(serviceFeeWeekStart(now), -SERVICE_FEE_GRACE_DAYS);
}

export async function ensureServiceFeeCharge(
  tx: Prisma.TransactionClient,
  payment: {
    id: string;
    partnerId: string;
    platformFee: Prisma.Decimal;
    paidAt?: Date | null;
  }
): Promise<void> {
  if (Number(payment.platformFee) <= 0) return;

  await tx.serviceFeeEntry.upsert({
    where: {
      bookingPaymentId_type: {
        bookingPaymentId: payment.id,
        type: "CHARGE",
      },
    },
    create: {
      partnerId: payment.partnerId,
      bookingPaymentId: payment.id,
      type: "CHARGE",
      amount: payment.platformFee,
      createdAt: payment.paidAt ?? undefined,
    },
    update: {},
  });
}

export type ServiceFeeBalance = {
  earned: number;
  paid: number;
  pending: number;
  amountDue: number;
  overdueAmount: number;
  credit: number;
  blocked: boolean;
  oldestEntryAt: Date | null;
  nextDueAt: Date | null;
};

export async function calculateServiceFeeBalance(
  db: FeeDb,
  partnerId: string,
  now: Date = new Date()
): Promise<ServiceFeeBalance> {
  const cutoff = serviceFeeOverdueCutoff(now);
  const [allEntries, overdueEntries, paid, pending, oldest] =
    await Promise.all([
      db.serviceFeeEntry.aggregate({
        where: { partnerId },
        _sum: { amount: true },
      }),
      db.serviceFeeEntry.aggregate({
        where: { partnerId, createdAt: { lt: cutoff } },
        _sum: { amount: true },
      }),
      db.serviceFeeSettlement.aggregate({
        where: { partnerId, status: "PAID" },
        _sum: { amount: true },
      }),
      db.serviceFeeSettlement.aggregate({
        where: { partnerId, status: "SUBMITTED" },
        _sum: { amount: true },
      }),
      db.serviceFeeEntry.findMany({
        where: { partnerId },
        orderBy: { createdAt: "asc" },
        select: { amount: true, createdAt: true },
      }),
    ]);

  const earned = money(Number(allEntries._sum.amount ?? 0));
  const paidAmount = money(Number(paid._sum.amount ?? 0));
  const pendingAmount = money(Number(pending._sum.amount ?? 0));
  const uncovered = money(earned - paidAmount - pendingAmount);
  const overdueBase = money(Number(overdueEntries._sum.amount ?? 0));
  // A recent refund is allowed to reduce an older unpaid balance.
  const overdueAmount = money(
    Math.max(0, Math.min(uncovered, overdueBase - paidAmount - pendingAmount))
  );

  const covered = paidAmount + pendingAmount;
  let running = 0;
  let oldestUncoveredAt: Date | null = null;
  for (const entry of oldest) {
    running = money(running + Number(entry.amount));
    if (running > covered && !oldestUncoveredAt) {
      oldestUncoveredAt = entry.createdAt;
    }
  }
  const nextDueAt =
    oldestUncoveredAt && uncovered > 0
      ? addDaysTo(serviceFeeWeekStart(oldestUncoveredAt), 14)
      : null;

  return {
    earned,
    paid: paidAmount,
    pending: pendingAmount,
    amountDue: Math.max(0, uncovered),
    overdueAmount,
    credit: Math.max(0, money(paidAmount - earned)),
    blocked: overdueAmount >= 0.01,
    oldestEntryAt: oldestUncoveredAt,
    nextDueAt,
  };
}

export type ServiceFeeSettlementView = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  currency: string;
  status: ServiceFeeSettlementStatus;
  paymentReference: string | null;
  receiptImage: string | null;
  provider: string | null;
  providerPaymentId: string | null;
  redirectUrl: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
};

const settlementSelect = {
  id: true,
  partnerId: true,
  periodStart: true,
  periodEnd: true,
  amount: true,
  currency: true,
  status: true,
  paymentReference: true,
  receiptImage: true,
  provider: true,
  providerPaymentId: true,
  redirectUrl: true,
  submittedAt: true,
  reviewedAt: true,
  reviewNote: true,
  partner: { select: { name: true, email: true } },
} as const;

function mapSettlement(
  row: Prisma.ServiceFeeSettlementGetPayload<{
    select: typeof settlementSelect;
  }>
): ServiceFeeSettlementView {
  const { partner, amount, ...rest } = row;
  return {
    ...rest,
    amount: Number(amount),
    partnerName: partner.name ?? "Partner",
    partnerEmail: partner.email,
  };
}

export async function getPartnerServiceFeeView(
  partnerId: string
): Promise<{
  balance: ServiceFeeBalance;
  settlements: ServiceFeeSettlementView[];
}> {
  const [balance, rows] = await Promise.all([
    calculateServiceFeeBalance(prisma, partnerId),
    prisma.serviceFeeSettlement.findMany({
      where: { partnerId },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: settlementSelect,
    }),
  ]);
  return { balance, settlements: rows.map(mapSettlement) };
}

export async function isServiceFeeOverdue(partnerId: string): Promise<boolean> {
  return (await calculateServiceFeeBalance(prisma, partnerId)).blocked;
}

export async function listAdminServiceFeeSettlements(): Promise<{
  submitted: ServiceFeeSettlementView[];
  history: ServiceFeeSettlementView[];
}> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();
  const rows = await prisma.serviceFeeSettlement.findMany({
    orderBy: { submittedAt: "desc" },
    take: 100,
    select: settlementSelect,
  });
  const mapped = rows.map(mapSettlement);
  return {
    submitted: mapped.filter((row) => row.status === "SUBMITTED"),
    history: mapped.filter(
      (row) =>
        row.status !== "SUBMITTED" && row.status !== "AWAITING_PAYMENT"
    ),
  };
}

export async function pendingServiceFeeSettlementCount(): Promise<number> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();
  return prisma.serviceFeeSettlement.count({
    where: { status: "SUBMITTED" },
  });
}
