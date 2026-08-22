import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { TrainerPaymentSettings } from "@/components/trainers/TrainerPaymentSettings";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Payments — Bunal.club" };

export default async function TrainerPaymentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  if (!profile) redirect("/dashboard/trainer");
  const [entries, paid, pending, settlements] = await Promise.all([
    prisma.trainerServiceFeeEntry.aggregate({ where: { trainerId: user.id }, _sum: { amount: true } }),
    prisma.trainerServiceFeeSettlement.aggregate({ where: { trainerId: user.id, status: "PAID" }, _sum: { amount: true } }),
    prisma.trainerServiceFeeSettlement.aggregate({ where: { trainerId: user.id, status: "SUBMITTED" }, _sum: { amount: true } }),
    prisma.trainerServiceFeeSettlement.findMany({
      where: { trainerId: user.id },
      orderBy: { submittedAt: "desc" },
      take: 12,
      select: { id: true, amount: true, status: true, submittedAt: true },
    }),
  ]);
  const accrued = Number(entries._sum.amount ?? 0);
  const paidAmount = Number(paid._sum.amount ?? 0);
  const pendingAmount = Number(pending._sum.amount ?? 0);
  const due = Math.max(0, Math.round((accrued - paidAmount) * 100) / 100);
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
          accrued,
          paid: paidAmount,
          pending: pendingAmount,
          due,
          settlements: settlements.map((item) => ({ ...item, amount: Number(item.amount), submittedAt: item.submittedAt.toISOString() })),
        }}
      />
    </div>
  );
}
