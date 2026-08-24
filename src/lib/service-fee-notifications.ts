import "server-only";

import {
  emailDeliveryConfigured,
  sendServiceFeeOverdueEmail,
} from "@/lib/email";
import { prisma } from "@/lib/db";
import {
  calculateServiceFeeBalance,
  serviceFeeWeekStart,
} from "@/lib/service-fees";
import { calculateTrainerServiceFeeBalance } from "@/lib/trainer-service-fees";
import { addDaysTo, manilaDateOf } from "@/lib/time";
import { appUrl } from "@/lib/urls";

export const PARTNER_SERVICE_FEE_OVERDUE_REMINDER_DAYS = 1;
export const TRAINER_SERVICE_FEE_OVERDUE_REMINDER_DAYS = 7;

export type ServiceFeeNotificationSweepResult = {
  sent: number;
  skipped: number;
  failed: number;
};

export async function notifyPartnersOfOverdueServiceFees(
  now: Date = new Date(),
  options: { partnerIds?: string[] } = {}
): Promise<ServiceFeeNotificationSweepResult> {
  const result: ServiceFeeNotificationSweepResult = {
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!emailDeliveryConfigured()) return result;

  const partners = await prisma.user.findMany({
    where: {
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      ...(options.partnerIds ? { id: { in: options.partnerIds } } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      serviceFeeReminderAt: true,
    },
  });
  const reminderCutoff = addDaysTo(
    now,
    -PARTNER_SERVICE_FEE_OVERDUE_REMINDER_DAYS
  );
  const reminderPeriod = manilaDateOf(now);

  for (const partner of partners) {
    const balance = await calculateServiceFeeBalance(prisma, partner.id, now);
    const dueSoon = Boolean(
      balance.amountDue >= 0.01 &&
        balance.nextDueAt &&
        now.getTime() < balance.nextDueAt.getTime() &&
        now.getTime() >= addDaysTo(balance.nextDueAt, -1).getTime()
    );
    const overdue = balance.overdueAmount >= 0.01;
    if ((!dueSoon && !overdue) || balance.pending >= 0.01) {
      result.skipped++;
      continue;
    }

    const previousNotification = partner.serviceFeeReminderAt;
    if (previousNotification && previousNotification > reminderCutoff) {
      result.skipped++;
      continue;
    }

    // Claim delivery before calling the provider. Concurrent sweep runs can
    // therefore never send the same partner two reminders.
    const claimed = await prisma.user.updateMany({
      where: {
        id: partner.id,
        OR: [
          { serviceFeeReminderAt: null },
          { serviceFeeReminderAt: { lte: reminderCutoff } },
        ],
      },
      data: { serviceFeeReminderAt: now },
    });
    if (claimed.count !== 1) {
      result.skipped++;
      continue;
    }

    try {
      await sendServiceFeeOverdueEmail({
        to: partner.email,
        partnerName: partner.name ?? "Partner",
        reminderKind: dueSoon ? "DUE_SOON" : "OVERDUE",
        overdueAmount: balance.overdueAmount,
        amountDue: balance.amountDue,
        dueAt: balance.nextDueAt,
        enforcementAt: balance.enforcementAt,
        blocked: balance.blocked,
        actionUrl: appUrl("/dashboard/payments"),
        idempotencyKey: `service-fee-reminder:${dueSoon ? "due-soon" : "overdue"}:${partner.id}:${reminderPeriod}`,
      });
      result.sent++;
    } catch (error) {
      // Release only this run's claim. A later sweep can retry with the same
      // provider idempotency key if delivery failed or its result was unclear.
      await prisma.user.updateMany({
        where: { id: partner.id, serviceFeeReminderAt: now },
        data: { serviceFeeReminderAt: previousNotification },
      });
      result.failed++;
      console.error(
        "Service-fee overdue notification failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  return result;
}

export async function notifyTrainersOfOverdueServiceFees(
  now: Date = new Date(),
  options: { trainerIds?: string[] } = {}
): Promise<ServiceFeeNotificationSweepResult> {
  const result: ServiceFeeNotificationSweepResult = {
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!emailDeliveryConfigured()) return result;

  const profiles = await prisma.trainerProfile.findMany({
    where: {
      status: "ACTIVE",
      ...(options.trainerIds
        ? { userId: { in: options.trainerIds } }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      serviceFeeReminderAt: true,
      user: {
        select: { email: true, name: true, playerName: true },
      },
    },
  });
  const reminderCutoff = addDaysTo(
    now,
    -TRAINER_SERVICE_FEE_OVERDUE_REMINDER_DAYS
  );
  const reminderPeriod = manilaDateOf(serviceFeeWeekStart(now));

  for (const profile of profiles) {
    const balance = await calculateTrainerServiceFeeBalance(
      prisma,
      profile.userId,
      now
    );
    if (balance.overdueAmount < 0.01 || balance.pending >= 0.01) {
      result.skipped++;
      continue;
    }

    const previousNotification = profile.serviceFeeReminderAt;
    if (previousNotification && previousNotification > reminderCutoff) {
      result.skipped++;
      continue;
    }

    const claimed = await prisma.trainerProfile.updateMany({
      where: {
        id: profile.id,
        OR: [
          { serviceFeeReminderAt: null },
          { serviceFeeReminderAt: { lte: reminderCutoff } },
        ],
      },
      data: { serviceFeeReminderAt: now },
    });
    if (claimed.count !== 1) {
      result.skipped++;
      continue;
    }

    try {
      await sendServiceFeeOverdueEmail({
        to: profile.user.email,
        partnerName:
          profile.user.playerName ?? profile.user.name ?? "Trainer",
        accountType: "TRAINER",
        overdueAmount: balance.overdueAmount,
        amountDue: balance.amountDue,
        dueAt: balance.nextDueAt,
        enforcementAt: balance.enforcementAt,
        blocked: balance.blocked,
        actionUrl: appUrl("/dashboard/trainer/payments"),
        idempotencyKey: `trainer-service-fee-overdue:${profile.userId}:${reminderPeriod}`,
      });
      result.sent++;
    } catch (error) {
      await prisma.trainerProfile.updateMany({
        where: { id: profile.id, serviceFeeReminderAt: now },
        data: { serviceFeeReminderAt: previousNotification },
      });
      result.failed++;
      console.error(
        "Trainer service-fee overdue notification failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  return result;
}
