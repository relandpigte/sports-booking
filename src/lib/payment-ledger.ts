import "server-only";

import type { Prisma } from "@prisma/client";

import { ensurePayoutEarning, ensurePayoutRefund } from "@/lib/payouts";
import { ensureServiceFeeCharge } from "@/lib/service-fees";

type LedgerPayment = {
  id: string;
  partnerId: string;
  platformFee: Prisma.Decimal;
  paidAt?: Date | null;
};

async function platformCollected(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<boolean> {
  const row = await tx.bookingPayment.findUnique({
    where: { id: paymentId },
    select: { collectedBy: true },
  });
  return row?.collectedBy === "PLATFORM";
}

// The one place a settled court or event payment reaches a ledger, because the
// two rails owe money in opposite directions:
//
//   - PLATFORM: Bunal.club holds the whole payment, so it owes the venue its
//     share. There is no service fee to collect — it never left.
//   - DIRECT: the venue's own account holds the payment, so the venue owes
//     Bunal.club the service fee.
//
// Both writers are idempotent, so every settle leg may call this.
export async function recordSettlementLedger(
  tx: Prisma.TransactionClient,
  payment: LedgerPayment
): Promise<void> {
  if (await platformCollected(tx, payment.id)) {
    await ensurePayoutEarning(tx, { bookingPaymentId: payment.id });
    return;
  }
  await ensureServiceFeeCharge(tx, payment);
}

// A refund never returns the service fee. On the direct rail that means the
// fee stays owed; on the platform rail it means only the venue's share comes
// back off what the venue is owed.
export async function recordRefundLedger(
  tx: Prisma.TransactionClient,
  payment: LedgerPayment
): Promise<void> {
  if (await platformCollected(tx, payment.id)) {
    await ensurePayoutRefund(tx, { bookingPaymentId: payment.id });
    return;
  }
  await ensureServiceFeeCharge(tx, payment);
}
