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
import { addDaysTo, manilaDateOf } from "@/lib/time";
import { appUrl } from "@/lib/urls";

export const SERVICE_FEE_OVERDUE_REMINDER_DAYS = 7;

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
  const reminderCutoff = addDaysTo(now, -SERVICE_FEE_OVERDUE_REMINDER_DAYS);
  const reminderPeriod = manilaDateOf(serviceFeeWeekStart(now));

  for (const partner of partners) {
    const balance = await calculateServiceFeeBalance(prisma, partner.id, now);
    if (!balance.blocked) {
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
        overdueAmount: balance.overdueAmount,
        amountDue: balance.amountDue,
        dueAt: balance.nextDueAt,
        actionUrl: appUrl("/dashboard/payments"),
        idempotencyKey: `service-fee-overdue:${partner.id}:${reminderPeriod}`,
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
