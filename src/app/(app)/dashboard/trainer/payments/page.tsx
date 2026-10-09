import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PayoutStatement } from "@/components/payments/PayoutStatement";
import { TrainerPaymentSettings } from "@/components/trainers/TrainerPaymentSettings";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { TrainerWorkspaceHeader } from "@/components/trainers/TrainerWorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import { getPayoutStatement } from "@/lib/payouts";
import {
  calculateTrainerServiceFeeBalance,
  listTrainerServiceFeeWaivers,
} from "@/lib/trainer-service-fees";
import {
  pollLatestTrainerServiceFeeCheckout,
  pollTrainerServiceFeeCheckout,
} from "@/lib/trainer-service-fee-payments";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Payments — Bunal.club" };

export default async function TrainerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    settlement?: string | string[];
  }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  if (!profile) redirect("/dashboard/trainer");
  const query = await searchParams;
  const settlementId = Array.isArray(query.settlement)
    ? query.settlement[0]
    : query.settlement;
  if (settlementId) {
    await pollTrainerServiceFeeCheckout({
      settlementId,
      trainerId: user.id,
    });
  } else {
    await pollLatestTrainerServiceFeeCheckout(user.id);
  }
  const [balance, settlements, waivers, paymongoSettlementEnabled, statement] = await Promise.all([
    calculateTrainerServiceFeeBalance(prisma, user.id),
    prisma.trainerServiceFeeSettlement.findMany({
      where: { trainerId: user.id },
      orderBy: { submittedAt: "desc" },
      take: 12,
      select: {
        id: true,
        amount: true,
        status: true,
        provider: true,
        submittedAt: true,
      },
    }),
    listTrainerServiceFeeWaivers(user.id, 12),
    platformPaymongoConfigured(),
    getPayoutStatement(user.id, "TRAINER"),
  ]);
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
  const activeManualMethods = methods.filter((method) => method.active).length;
  const checkoutReady =
    profile.paymentMode === "AUTOMATIC"
      ? statement.account != null
      : activeManualMethods > 0;

  return (
    <div>
      <TrainerWorkspaceHeader
        eyebrow="Payment workspace"
        title="Payments"
        description="Choose how players pay, set where your payouts go, and track what Bunal.club has sent you."
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
              ? "Add your payout account before accepting automatic player payments."
              : "Add an active payment destination before accepting manual transfers."
        }
        icon="payments"
      />
      <div className="mt-6">
        <TrainerTabs />
      </div>
      <TrainerPaymentSettings
        mode={profile.paymentMode}
        payoutAccount={statement.account}
        payouts={<PayoutStatement statement={statement} />}
        methods={methods}
        paymongoSettlementEnabled={paymongoSettlementEnabled}
        settlementInstructions={
          process.env.SERVICE_FEE_PAYMENT_INSTRUCTIONS?.trim() ||
          "Transfer the amount using the payment details provided by the admin, then enter the reference and upload the receipt."
        }
        serviceFees={{
          accrued: balance.earned,
          paid: balance.paid,
          waived: balance.waived,
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
          waivers: waivers.map((item) => ({
            id: item.id,
            amount: item.amount,
            reason: item.reason,
            grantedAt: item.grantedAt.toISOString(),
            reversedAt: item.reversedAt?.toISOString() ?? null,
            reversalReason: item.reversalReason,
          })),
        }}
      />
    </div>
  );
}
