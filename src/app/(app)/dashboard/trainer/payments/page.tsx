import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TrainerPaymentSettings } from "@/components/trainers/TrainerPaymentSettings";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { TrainerWorkspaceHeader } from "@/components/trainers/TrainerWorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
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
  const connected = Boolean(gateway && !gateway.disconnectedAt);
  const activeManualMethods = methods.filter((method) => method.active).length;
  const checkoutReady =
    profile.paymentMode === "AUTOMATIC"
      ? connected
      : activeManualMethods > 0;

  return (
    <div>
      <TrainerWorkspaceHeader
        eyebrow="Payment workspace"
        title="Payments"
        description="Configure player checkout, payment destinations, and service-fee settlements."
        badge={
          <Badge tone={checkoutReady ? "success" : "warn"}>
            {checkoutReady ? "Checkout ready" : "Setup required"}
          </Badge>
        }
        calloutLabel="Checkout readiness"
        callout={
          checkoutReady
            ? "Your current checkout mode is ready to receive player payments."
            : profile.paymentMode === "AUTOMATIC"
              ? "Connect PayMongo before accepting automatic player payments."
              : "Add an active payment destination before accepting manual transfers."
        }
        icon="payments"
      />
      <div className="mt-6">
        <TrainerTabs />
      </div>
      <TrainerPaymentSettings
        mode={profile.paymentMode}
        gateway={gateway}
        methods={methods}
        settlementInstructions={
          process.env.SERVICE_FEE_PAYMENT_INSTRUCTIONS?.trim() ||
          "Transfer the amount using the payment details provided by the admin, then enter the reference and upload the receipt."
        }
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
          settlements: settlements.map((item) => ({
            ...item,
            amount: Number(item.amount),
            submittedAt: item.submittedAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
