import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { TrainerPaymentSettings } from "@/components/trainers/TrainerPaymentSettings";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { calculateTrainerServiceFeeBalance } from "@/lib/trainer-service-fees";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Payments — Bunal.club" };

export default async function TrainerPaymentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  if (!profile) redirect("/dashboard/trainer");
  const [balance, settlements] = await Promise.all([
    calculateTrainerServiceFeeBalance(prisma, user.id),
    prisma.trainerServiceFeeSettlement.findMany({
      where: { trainerId: user.id },
      orderBy: { submittedAt: "desc" },
      take: 12,
      select: { id: true, amount: true, status: true, submittedAt: true },
    }),
  ]);
  const gateway = profile.user.trainerGateway
    ? { accountLabel: profile.user.trainerGateway.accountLabel, disconnectedAt: profile.user.trainerGateway.disconnectedAt }
    : null;
  const methods = profile.user.trainerManualMethods.map(
    ({
      id,
      label,
      network,
      active,
      accountName,
      accountIdentifier,
      instructions,
      qrImage,
    }) => ({
      id,
      label,
      network,
      active,
      accountName,
      accountIdentifier,
      instructions,
      qrImage,
    })
  );

  return (
    <div>
      <DashboardPageHeader eyebrow="Payment workspace" title="Payments" description="Configure player checkout, payment destinations, and service-fee settlements." />
      <div className="mt-6">
      <TrainerTabs />
      </div>
      <TrainerPaymentSettings
        mode={profile.paymentMode}
        gateway={gateway}
        methods={methods}
        settlementInstructions={process.env.SERVICE_FEE_PAYMENT_INSTRUCTIONS?.trim() || "Transfer the amount using the payment details provided by the admin, then enter the reference and upload the receipt."}
        serviceFees={{
          accrued: balance.earned,
          paid: balance.paid,
          pending: balance.pending,
          due: balance.amountDue,
          overdue: balance.overdueAmount,
          blocked: balance.blocked,
          inEnforcementGrace: balance.inEnforcementGrace,
          dueAt: balance.nextDueAt?.toISOString() ?? null,
          enforcementAt: balance.enforcementAt?.toISOString() ?? null,
          settlements: settlements.map((item) => ({ ...item, amount: Number(item.amount), submittedAt: item.submittedAt.toISOString() })),
        }}
      />
    </div>
  );
}
