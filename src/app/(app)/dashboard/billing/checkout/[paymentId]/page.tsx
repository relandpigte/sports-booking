import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FakeCheckout } from "@/components/billing/FakeCheckout";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/dal";
import { getPaymentProvider } from "@/lib/payments";
import { formatPHP } from "@/lib/currency";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Confirm payment — Bunal.ph",
};

// Stands in for the gateway's hosted e-wallet page. Approving here posts a
// correctly signed body to the REAL webhook route, so the whole
// charge → redirect → verify → apply path is exercised rather than bypassed.
export default async function FakeCheckoutPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  // Next 16: params is a Promise.
  const { paymentId } = await params;

  // A real gateway hosts this page itself; there is nothing to stub.
  if (getPaymentProvider().id !== "fake") notFound();

  const partner = await requirePartner();
  const payment = await prisma.payment.findFirst({
    // Ownership in the where clause.
    where: { id: paymentId, userId: partner.id },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      plan: { select: { name: true } },
    },
  });
  if (!payment) notFound();
  if (payment.status !== "PENDING") redirect("/dashboard/billing");

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-600">
          Simulated checkout
        </p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          No real payment is taken. This stands in for the {""}
          {PAYMENT_METHOD_LABELS[payment.method] ?? "wallet"} approval screen.
        </p>

        <dl className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Plan</dt>
            <dd className="font-medium text-gray-900">{payment.plan.name}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Amount</dt>
            <dd className="text-base font-semibold text-gray-900">
              {formatPHP(payment.amount.toNumber())}
            </dd>
          </div>
        </dl>

        <FakeCheckout paymentId={payment.id} />
      </div>
    </div>
  );
}
