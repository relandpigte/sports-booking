import type { PaymentSummaryItem } from "@/components/partner/PaymentWorkspace";
import { formatPHP } from "@/lib/currency";
import type { PayoutStatement } from "@/lib/payouts";

function formatSummaryDate(value: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(value);
}

// The two payout tiles on the venue and trainer payment workspaces: what the
// next run will send, and what is already on its way.
export function payoutSummaryItems(
  statement: PayoutStatement
): PaymentSummaryItem[] {
  const negative = statement.upcoming < 0;
  const beingSent = statement.pending.reduce(
    (sum, payout) => sum + payout.amount,
    0
  );
  return [
    {
      label: negative ? "To be deducted" : "Next payout",
      value: formatPHP(
        negative
          ? Math.abs(statement.upcoming)
          : Math.max(statement.nextPayoutAmount, 0)
      ),
      detail: negative
        ? "Refunds after an earlier payout"
        : `Scheduled ${formatSummaryDate(statement.nextPayoutAt)}`,
      tone: negative ? "warning" : "default",
    },
    {
      label: "Being sent",
      value: formatPHP(beingSent),
      detail: `${formatPHP(statement.paidTotal)} paid to date`,
      tone: "default",
    },
  ];
}
