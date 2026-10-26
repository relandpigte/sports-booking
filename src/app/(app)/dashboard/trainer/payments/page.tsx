import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PayoutStatement } from "@/components/payments/PayoutStatement";
import { TrainerPaymentSettings } from "@/components/trainers/TrainerPaymentSettings";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { TrainerWorkspaceHeader } from "@/components/trainers/TrainerWorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { payoutSummaryItems } from "@/components/payments/payout-summary";
import { getCurrentUser } from "@/lib/dal";
import { getPayoutStatement } from "@/lib/payouts";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Payments — Bunal.club" };

export default async function TrainerPaymentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  if (!profile) redirect("/dashboard/trainer");
  const statement = await getPayoutStatement(user.id, "TRAINER");
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
        payoutSummary={payoutSummaryItems(statement)}
      />
    </div>
  );
}
