import "server-only";

import {
  Prisma,
  type PaymentCollectionMode,
  type PaymentStatus,
  type ServiceFeeEntryType,
  type TrainerStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  type ServiceFeeBalance,
  type ServiceFeeStanding,
  serviceFeeBalanceFromLedger,
  serviceFeeOverdueCutoff,
  serviceFeeStanding,
} from "@/lib/service-fees";

type TrainerFeeDb = Pick<
  Prisma.TransactionClient,
  "trainerServiceFeeEntry" | "trainerServiceFeeSettlement"
>;

export type AdminTrainerServiceFeeBreakdown = {
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  trainerStatus: TrainerStatus;
  standing: ServiceFeeStanding;
  balance: ServiceFeeBalance;
  transactionCount: number;
  lastActivityAt: Date | null;
  lastPaidAt: Date | null;
  lastPaidAmount: number;
};

export type AdminTrainerServiceFeeTransaction = {
  id: string;
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  playerName: string;
  sessionPublicId: string;
  sessionDate: string;
  startHour: number;
  endHour: number;
  type: ServiceFeeEntryType;
  amount: number;
  paymentAmount: number;
  trainerAmount: number;
  collectionMode: PaymentCollectionMode;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

const standingOrder: Record<ServiceFeeStanding, number> = {
  OVERDUE: 0,
  GRACE_PERIOD: 1,
  UNDER_REVIEW: 2,
  DUE_SOON: 3,
  CURRENT: 4,
  NO_BALANCE: 5,
};

export async function calculateTrainerServiceFeeBalance(
  db: TrainerFeeDb,
  trainerId: string,
  now: Date = new Date()
): Promise<ServiceFeeBalance> {
  const cutoff = serviceFeeOverdueCutoff(now);
  const [entries, overdueEntries, paid, pending] = await Promise.all([
    db.trainerServiceFeeEntry.findMany({
      where: { trainerId },
      orderBy: { createdAt: "asc" },
      select: { amount: true, createdAt: true },
    }),
    db.trainerServiceFeeEntry.aggregate({
      where: { trainerId, createdAt: { lt: cutoff } },
      _sum: { amount: true },
    }),
    db.trainerServiceFeeSettlement.aggregate({
      where: { trainerId, status: "PAID" },
      _sum: { amount: true },
    }),
    db.trainerServiceFeeSettlement.aggregate({
      where: { trainerId, status: "SUBMITTED" },
      _sum: { amount: true },
    }),
  ]);

  return serviceFeeBalanceFromLedger({
    earned: entries.reduce((sum, entry) => sum + Number(entry.amount), 0),
    overdueBase: Number(overdueEntries._sum.amount ?? 0),
    paid: Number(paid._sum.amount ?? 0),
    waived: 0,
    pending: Number(pending._sum.amount ?? 0),
    entries,
    now,
  });
}

export async function isTrainerServiceFeeOverdue(
  trainerId: string,
  now: Date = new Date()
): Promise<boolean> {
  return (
    await calculateTrainerServiceFeeBalance(prisma, trainerId, now)
  ).blocked;
}

export async function listOverdueTrainerIds(
  trainerIds: string[],
  now: Date = new Date()
): Promise<Set<string>> {
  if (trainerIds.length === 0) return new Set();
  const uniqueTrainerIds = [...new Set(trainerIds)];
  const cutoff = serviceFeeOverdueCutoff(now);
  const [entries, paidGroups] = await Promise.all([
    prisma.trainerServiceFeeEntry.findMany({
      where: { trainerId: { in: uniqueTrainerIds } },
      orderBy: [{ trainerId: "asc" }, { createdAt: "asc" }],
      select: { trainerId: true, amount: true, createdAt: true },
    }),
    prisma.trainerServiceFeeSettlement.groupBy({
      by: ["trainerId"],
      where: { trainerId: { in: uniqueTrainerIds }, status: "PAID" },
      _sum: { amount: true },
    }),
  ]);
  const entriesByTrainer = new Map<
    string,
    Array<{ amount: Prisma.Decimal; createdAt: Date }>
  >();
  for (const entry of entries) {
    const trainerEntries = entriesByTrainer.get(entry.trainerId) ?? [];
    trainerEntries.push({ amount: entry.amount, createdAt: entry.createdAt });
    entriesByTrainer.set(entry.trainerId, trainerEntries);
  }
  const paidByTrainer = new Map(
    paidGroups.map((row) => [row.trainerId, Number(row._sum.amount ?? 0)])
  );

  return new Set(
    uniqueTrainerIds.filter((trainerId) => {
      const trainerEntries = entriesByTrainer.get(trainerId) ?? [];
      return serviceFeeBalanceFromLedger({
        earned: trainerEntries.reduce(
          (sum, entry) => sum + Number(entry.amount),
          0
        ),
        overdueBase: trainerEntries.reduce(
          (sum, entry) =>
            entry.createdAt < cutoff ? sum + Number(entry.amount) : sum,
          0
        ),
        paid: paidByTrainer.get(trainerId) ?? 0,
        waived: 0,
        pending: 0,
        entries: trainerEntries,
        now,
      }).blocked;
    })
  );
}

export async function listAdminTrainerServiceFeeBreakdown(
  now: Date = new Date()
): Promise<AdminTrainerServiceFeeBreakdown[]> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();

  const cutoff = serviceFeeOverdueCutoff(now);
  const [profiles, entries, paidGroups, pendingGroups, paidSettlements] =
    await Promise.all([
      prisma.trainerProfile.findMany({
        orderBy: [
          { user: { playerName: "asc" } },
          { user: { name: "asc" } },
        ],
        select: {
          status: true,
          user: {
            select: {
              id: true,
              name: true,
              playerName: true,
              email: true,
            },
          },
        },
      }),
      prisma.trainerServiceFeeEntry.findMany({
        orderBy: [{ trainerId: "asc" }, { createdAt: "asc" }],
        select: { trainerId: true, amount: true, createdAt: true },
      }),
      prisma.trainerServiceFeeSettlement.groupBy({
        by: ["trainerId"],
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.trainerServiceFeeSettlement.groupBy({
        by: ["trainerId"],
        where: { status: "SUBMITTED" },
        _sum: { amount: true },
      }),
      prisma.trainerServiceFeeSettlement.findMany({
        where: { status: "PAID" },
        orderBy: { submittedAt: "desc" },
        select: {
          trainerId: true,
          amount: true,
          reviewedAt: true,
          submittedAt: true,
        },
      }),
    ]);

  const entriesByTrainer = new Map<
    string,
    Array<{ amount: Prisma.Decimal; createdAt: Date }>
  >();
  for (const entry of entries) {
    const trainerEntries = entriesByTrainer.get(entry.trainerId) ?? [];
    trainerEntries.push({ amount: entry.amount, createdAt: entry.createdAt });
    entriesByTrainer.set(entry.trainerId, trainerEntries);
  }
  const paidByTrainer = new Map(
    paidGroups.map((row) => [row.trainerId, Number(row._sum.amount ?? 0)])
  );
  const pendingByTrainer = new Map(
    pendingGroups.map((row) => [row.trainerId, Number(row._sum.amount ?? 0)])
  );
  const latestPaidByTrainer = new Map<
    string,
    { amount: number; paidAt: Date }
  >();
  for (const settlement of paidSettlements) {
    if (latestPaidByTrainer.has(settlement.trainerId)) continue;
    latestPaidByTrainer.set(settlement.trainerId, {
      amount: Number(settlement.amount),
      paidAt: settlement.reviewedAt ?? settlement.submittedAt,
    });
  }

  return profiles
    .map((profile): AdminTrainerServiceFeeBreakdown => {
      const trainer = profile.user;
      const trainerEntries = entriesByTrainer.get(trainer.id) ?? [];
      const balance = serviceFeeBalanceFromLedger({
        earned: trainerEntries.reduce(
          (sum, entry) => sum + Number(entry.amount),
          0
        ),
        overdueBase: trainerEntries.reduce(
          (sum, entry) =>
            entry.createdAt < cutoff ? sum + Number(entry.amount) : sum,
          0
        ),
        paid: paidByTrainer.get(trainer.id) ?? 0,
        waived: 0,
        pending: pendingByTrainer.get(trainer.id) ?? 0,
        entries: trainerEntries,
        now,
      });
      const latestPaid = latestPaidByTrainer.get(trainer.id);
      return {
        trainerId: trainer.id,
        trainerName: trainer.playerName ?? trainer.name ?? trainer.email,
        trainerEmail: trainer.email,
        trainerStatus: profile.status,
        standing: serviceFeeStanding(balance),
        balance,
        transactionCount: trainerEntries.length,
        lastActivityAt:
          trainerEntries.at(-1)?.createdAt ?? latestPaid?.paidAt ?? null,
        lastPaidAt: latestPaid?.paidAt ?? null,
        lastPaidAmount: latestPaid?.amount ?? 0,
      };
    })
    .filter(
      (trainer) =>
        trainer.trainerStatus === "ACTIVE" ||
        trainer.transactionCount > 0 ||
        trainer.balance.paid > 0 ||
        trainer.balance.pending > 0
    )
    .sort(
      (left, right) =>
        standingOrder[left.standing] - standingOrder[right.standing] ||
        (left.balance.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.balance.nextDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        left.trainerName.localeCompare(right.trainerName)
    );
}

export async function listAdminTrainerServiceFeeTransactions(): Promise<
  AdminTrainerServiceFeeTransaction[]
> {
  const { requireAdmin } = await import("@/lib/admin");
  await requireAdmin();

  const rows = await prisma.trainerServiceFeeEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      trainerId: true,
      type: true,
      amount: true,
      createdAt: true,
      trainer: {
        select: { name: true, playerName: true, email: true },
      },
      payment: {
        select: {
          amount: true,
          trainerAmount: true,
          collectionMode: true,
          status: true,
          providerRef: true,
          manualPaymentRef: true,
          paidAt: true,
          player: {
            select: { name: true, playerName: true, email: true },
          },
          session: {
            select: {
              publicId: true,
              date: true,
              startHour: true,
              endHour: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    trainerId: row.trainerId,
    trainerName:
      row.trainer.playerName ?? row.trainer.name ?? row.trainer.email,
    trainerEmail: row.trainer.email,
    playerName:
      row.payment.player.playerName ??
      row.payment.player.name ??
      row.payment.player.email,
    sessionPublicId: row.payment.session.publicId,
    sessionDate: row.payment.session.date,
    startHour: row.payment.session.startHour,
    endHour: row.payment.session.endHour,
    type: row.type,
    amount: Number(row.amount),
    paymentAmount: Number(row.payment.amount),
    trainerAmount: Number(row.payment.trainerAmount),
    collectionMode: row.payment.collectionMode,
    paymentStatus: row.payment.status,
    paymentReference:
      row.payment.providerRef ?? row.payment.manualPaymentRef ?? null,
    paidAt: row.payment.paidAt,
    createdAt: row.createdAt,
  }));
}
