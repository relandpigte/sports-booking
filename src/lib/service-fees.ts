import "server-only";

import {
  Prisma,
  type PartnerStatus,
  type ServiceFeeSettlementStatus,
} from "@prisma/client";

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
  "serviceFeeEntry" | "serviceFeeSettlement" | "serviceFeeWaiver"
>;

export const SERVICE_FEE_GRACE_DAYS = 7;
// Once a balance reaches its weekly due date, partners receive a final
// enforcement window before paid bookings and public hub visibility pause.
export const SERVICE_FEE_ENFORCEMENT_GRACE_DAYS = 3;

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

  const feeSnapshot = await tx.bookingPayment.findUnique({
    where: { id: payment.id },
    select: {
      processingFee: true,
      processingFeeResponsibility: true,
    },
  });

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

  if (
    feeSnapshot?.processingFeeResponsibility === "BUNAL" &&
    Number(feeSnapshot.processingFee) > 0
  ) {
    await tx.serviceFeeEntry.upsert({
      where: {
        bookingPaymentId_type: {
          bookingPaymentId: payment.id,
          type: "PROCESSING_CREDIT",
        },
      },
      create: {
        partnerId: payment.partnerId,
        bookingPaymentId: payment.id,
        type: "PROCESSING_CREDIT",
        amount: feeSnapshot.processingFee.negated(),
        createdAt: payment.paidAt ?? undefined,
      },
      // A status poll can settle with the configured estimate milliseconds
      // before the signed webhook supplies PayMongo's exact fee.
      update: { amount: feeSnapshot.processingFee.negated() },
    });
  }
}

export async function ensureOrganizerGuestServiceFeeRefund(
  tx: Prisma.TransactionClient,
  input: {
    eventOrganizerGuestId: string;
    partnerId: string;
    createdAt?: Date;
  }
): Promise<void> {
  const charge = await tx.serviceFeeEntry.findUnique({
    where: {
      eventOrganizerGuestId_type: {
        eventOrganizerGuestId: input.eventOrganizerGuestId,
        type: "CHARGE",
      },
    },
    select: { amount: true },
  });
  if (!charge || Number(charge.amount) <= 0) return;

  await tx.serviceFeeEntry.upsert({
    where: {
      eventOrganizerGuestId_type: {
        eventOrganizerGuestId: input.eventOrganizerGuestId,
        type: "REFUND",
      },
    },
    create: {
      partnerId: input.partnerId,
      eventOrganizerGuestId: input.eventOrganizerGuestId,
      type: "REFUND",
      amount: charge.amount.negated(),
      createdAt: input.createdAt,
    },
    update: {},
  });
}

export type ServiceFeeBalance = {
  earned: number;
  paid: number;
  waived: number;
  pending: number;
  amountDue: number;
  overdueAmount: number;
  credit: number;
  blocked: boolean;
  inEnforcementGrace: boolean;
  oldestEntryAt: Date | null;
  nextDueAt: Date | null;
  enforcementAt: Date | null;
};

export type ServiceFeeLedgerEntry = {
  amount: Prisma.Decimal | number;
  createdAt: Date;
};

export function serviceFeeBalanceFromLedger({
  earned,
  overdueBase,
  paid,
  waived,
  pending,
  entries,
  now,
}: {
  earned: number;
  overdueBase: number;
  paid: number;
  waived: number;
  pending: number;
  entries: ServiceFeeLedgerEntry[];
  now: Date;
}): ServiceFeeBalance {
  const earnedAmount = money(earned);
  const paidAmount = money(paid);
  const waivedAmount = money(waived);
  const pendingAmount = money(pending);
  // Submitted proof is reported separately, but it is not money received.
  // Only an approved or automatically paid settlement reduces the balance.
  const covered = money(paidAmount + waivedAmount);
  const uncovered = money(earnedAmount - covered);
  // Negative legacy/manual adjustments reduce the oldest unpaid balance.
  const overdueAmount = money(
    Math.max(
      0,
      Math.min(uncovered, money(overdueBase) - covered)
    )
  );

  let running = 0;
  let oldestUncoveredAt: Date | null = null;
  for (const entry of entries) {
    running = money(running + Number(entry.amount));
    if (running > covered && !oldestUncoveredAt) {
      oldestUncoveredAt = entry.createdAt;
    }
  }
  const nextDueAt =
    oldestUncoveredAt && uncovered > 0
      ? addDaysTo(serviceFeeWeekStart(oldestUncoveredAt), 14)
      : null;
  const enforcementAt = nextDueAt
    ? addDaysTo(nextDueAt, SERVICE_FEE_ENFORCEMENT_GRACE_DAYS)
    : null;
  const overdue = overdueAmount >= 0.01;
  const blocked = Boolean(
    overdue && enforcementAt && enforcementAt.getTime() <= now.getTime()
  );

  return {
    earned: earnedAmount,
    paid: paidAmount,
    waived: waivedAmount,
    pending: pendingAmount,
    amountDue: Math.max(0, uncovered),
    overdueAmount,
    credit: Math.max(0, money(covered - earnedAmount)),
    blocked,
    inEnforcementGrace: overdue && !blocked,
    oldestEntryAt: oldestUncoveredAt,
    nextDueAt,
    enforcementAt,
  };
}

export async function calculateServiceFeeBalance(
  db: FeeDb,
  partnerId: string,
  now: Date = new Date()
): Promise<ServiceFeeBalance> {
  const cutoff = serviceFeeOverdueCutoff(now);
  const [allEntries, overdueEntries, paid, waived, pending, oldest] =
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
      db.serviceFeeWaiver.aggregate({
        where: { partnerId, reversedAt: null },
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

  return serviceFeeBalanceFromLedger({
    earned: Number(allEntries._sum.amount ?? 0),
    overdueBase: Number(overdueEntries._sum.amount ?? 0),
    paid: Number(paid._sum.amount ?? 0),
    waived: Number(waived._sum.amount ?? 0),
    pending: Number(pending._sum.amount ?? 0),
    entries: oldest,
    now,
  });
}

export type ServiceFeeStanding =
  | "OVERDUE"
  | "GRACE_PERIOD"
  | "UNDER_REVIEW"
  | "DUE_SOON"
  | "CURRENT"
  | "NO_BALANCE";

export function serviceFeeStanding(
  balance: ServiceFeeBalance
): ServiceFeeStanding {
  if (balance.blocked) return "OVERDUE";
  if (balance.inEnforcementGrace) return "GRACE_PERIOD";
  if (balance.pending >= 0.01) return "UNDER_REVIEW";
  if (balance.amountDue >= 0.01) return "DUE_SOON";
  if (balance.earned === 0 && balance.paid === 0) return "NO_BALANCE";
  return "CURRENT";
}

export type AdminPartnerServiceFeeBreakdown = {
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  partnerStatus: PartnerStatus | null;
  standing: ServiceFeeStanding;
  balance: ServiceFeeBalance;
  lastPaidAt: Date | null;
  lastPaidAmount: number;
};

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

export type ServiceFeeWaiverView = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  amount: number;
  reason: string;
  grantedAt: Date;
  grantedByName: string;
  balanceBefore: number;
  balanceAfter: number;
  reversedAt: Date | null;
  reversalReason: string | null;
  reversedByName: string | null;
  reversalBalanceBefore: number | null;
  reversalBalanceAfter: number | null;
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

const waiverSelect = {
  id: true,
  partnerId: true,
  amount: true,
  reason: true,
  grantedAt: true,
  balanceBefore: true,
  balanceAfter: true,
  reversedAt: true,
  reversalReason: true,
  reversalBalanceBefore: true,
  reversalBalanceAfter: true,
  partner: { select: { name: true, email: true } },
  grantedBy: { select: { name: true, email: true } },
  reversedBy: { select: { name: true, email: true } },
} as const;

function mapWaiver(
  row: Prisma.ServiceFeeWaiverGetPayload<{
    select: typeof waiverSelect;
  }>
): ServiceFeeWaiverView {
  return {
    id: row.id,
    partnerId: row.partnerId,
    partnerName: row.partner.name ?? row.partner.email,
    partnerEmail: row.partner.email,
    amount: Number(row.amount),
    reason: row.reason,
    grantedAt: row.grantedAt,
    grantedByName: row.grantedBy.name ?? row.grantedBy.email,
    balanceBefore: Number(row.balanceBefore),
    balanceAfter: Number(row.balanceAfter),
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    reversedByName: row.reversedBy
      ? row.reversedBy.name ?? row.reversedBy.email
      : null,
    reversalBalanceBefore:
      row.reversalBalanceBefore === null
        ? null
        : Number(row.reversalBalanceBefore),
    reversalBalanceAfter:
      row.reversalBalanceAfter === null
        ? null
        : Number(row.reversalBalanceAfter),
  };
}

export async function getPartnerServiceFeeView(
  partnerId: string
): Promise<{
  balance: ServiceFeeBalance;
  settlements: ServiceFeeSettlementView[];
  waivers: ServiceFeeWaiverView[];
}> {
  const [balance, rows, waivers] = await Promise.all([
    calculateServiceFeeBalance(prisma, partnerId),
    prisma.serviceFeeSettlement.findMany({
      where: { partnerId },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: settlementSelect,
    }),
    prisma.serviceFeeWaiver.findMany({
      where: { partnerId },
      orderBy: { grantedAt: "desc" },
      take: 20,
      select: waiverSelect,
    }),
  ]);
  return {
    balance,
    settlements: rows.map(mapSettlement),
    waivers: waivers.map(mapWaiver),
  };
}

export async function isServiceFeeOverdue(
  partnerId: string,
  now: Date = new Date()
): Promise<boolean> {
  return (await calculateServiceFeeBalance(prisma, partnerId, now)).blocked;
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

export async function listAdminServiceFeeWaivers(): Promise<
  ServiceFeeWaiverView[]
> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();
  const rows = await prisma.serviceFeeWaiver.findMany({
    orderBy: { grantedAt: "desc" },
    take: 100,
    select: waiverSelect,
  });
  return rows.map(mapWaiver);
}

const standingOrder: Record<ServiceFeeStanding, number> = {
  OVERDUE: 0,
  GRACE_PERIOD: 1,
  UNDER_REVIEW: 2,
  DUE_SOON: 3,
  CURRENT: 4,
  NO_BALANCE: 5,
};

export async function listAdminPartnerServiceFeeBreakdown(
  now: Date = new Date()
): Promise<AdminPartnerServiceFeeBreakdown[]> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();

  const cutoff = serviceFeeOverdueCutoff(now);
  const [
    partners,
    entries,
    paidGroups,
    waivedGroups,
    pendingGroups,
    paidSettlements,
  ] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "PARTNER" },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          partnerStatus: true,
        },
      }),
      prisma.serviceFeeEntry.findMany({
        orderBy: [{ partnerId: "asc" }, { createdAt: "asc" }],
        select: {
          partnerId: true,
          amount: true,
          createdAt: true,
        },
      }),
      prisma.serviceFeeSettlement.groupBy({
        by: ["partnerId"],
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.serviceFeeWaiver.groupBy({
        by: ["partnerId"],
        where: { reversedAt: null },
        _sum: { amount: true },
      }),
      prisma.serviceFeeSettlement.groupBy({
        by: ["partnerId"],
        where: { status: "SUBMITTED" },
        _sum: { amount: true },
      }),
      prisma.serviceFeeSettlement.findMany({
        where: { status: "PAID" },
        orderBy: { submittedAt: "desc" },
        select: {
          partnerId: true,
          amount: true,
          reviewedAt: true,
          submittedAt: true,
        },
      }),
    ]);

  const entriesByPartner = new Map<
    string,
    Array<{ amount: Prisma.Decimal; createdAt: Date }>
  >();
  for (const entry of entries) {
    const partnerEntries = entriesByPartner.get(entry.partnerId) ?? [];
    partnerEntries.push({ amount: entry.amount, createdAt: entry.createdAt });
    entriesByPartner.set(entry.partnerId, partnerEntries);
  }

  const paidByPartner = new Map(
    paidGroups.map((row) => [
      row.partnerId,
      Number(row._sum.amount ?? 0),
    ])
  );
  const waivedByPartner = new Map(
    waivedGroups.map((row) => [
      row.partnerId,
      Number(row._sum.amount ?? 0),
    ])
  );
  const pendingByPartner = new Map(
    pendingGroups.map((row) => [
      row.partnerId,
      Number(row._sum.amount ?? 0),
    ])
  );
  const latestPaidByPartner = new Map<
    string,
    { amount: number; paidAt: Date }
  >();
  for (const settlement of paidSettlements) {
    if (latestPaidByPartner.has(settlement.partnerId)) continue;
    latestPaidByPartner.set(settlement.partnerId, {
      amount: Number(settlement.amount),
      paidAt: settlement.reviewedAt ?? settlement.submittedAt,
    });
  }

  return partners
    .map((partner): AdminPartnerServiceFeeBreakdown => {
      const partnerEntries = entriesByPartner.get(partner.id) ?? [];
      const balance = serviceFeeBalanceFromLedger({
        earned: partnerEntries.reduce(
          (sum, entry) => sum + Number(entry.amount),
          0
        ),
        overdueBase: partnerEntries.reduce(
          (sum, entry) =>
            entry.createdAt < cutoff ? sum + Number(entry.amount) : sum,
          0
        ),
        paid: paidByPartner.get(partner.id) ?? 0,
        waived: waivedByPartner.get(partner.id) ?? 0,
        pending: pendingByPartner.get(partner.id) ?? 0,
        entries: partnerEntries,
        now,
      });
      const latestPaid = latestPaidByPartner.get(partner.id);
      return {
        partnerId: partner.id,
        partnerName: partner.name ?? "Partner",
        partnerEmail: partner.email,
        partnerStatus: partner.partnerStatus,
        standing: serviceFeeStanding(balance),
        balance,
        lastPaidAt: latestPaid?.paidAt ?? null,
        lastPaidAmount: latestPaid?.amount ?? 0,
      };
    })
    .sort(
      (left, right) =>
        standingOrder[left.standing] - standingOrder[right.standing] ||
        (left.balance.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.balance.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        left.partnerName.localeCompare(right.partnerName)
    );
}

export async function pendingServiceFeeSettlementCount(): Promise<number> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();
  return prisma.serviceFeeSettlement.count({
    where: { status: "SUBMITTED" },
  });
}
