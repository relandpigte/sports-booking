"use client";

import { useActionState, useEffect } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import {
  startServiceFeeCheckoutAction,
  submitServiceFeeSettlementAction,
  type ServiceFeeFormState,
} from "@/lib/service-fee-actions";
import type {
  ServiceFeeBalance,
  ServiceFeeSettlementView,
} from "@/lib/service-fees";
import { formatPHP } from "@/lib/currency";

const initialState: ServiceFeeFormState = {};

const statusMeta = {
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "warn" as const },
  SUBMITTED: { label: "Under review", tone: "warn" as const },
  PAID: { label: "Paid", tone: "success" as const },
  REJECTED: { label: "Rejected", tone: "danger" as const },
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(date));

export function ServiceFeePanel({
  balance,
  settlements,
  paymongoSettlementEnabled,
  paymentInstructions,
  readOnly = false,
}: {
  balance: ServiceFeeBalance;
  settlements: ServiceFeeSettlementView[];
  paymongoSettlementEnabled: boolean;
  paymentInstructions: string;
  readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(
    submitServiceFeeSettlementAction,
    initialState
  );
  const [checkoutState, checkoutAction, startingCheckout] = useActionState(
    startServiceFeeCheckoutAction,
    initialState
  );

  useEffect(() => {
    if (checkoutState.redirectUrl) {
      window.location.href = checkoutState.redirectUrl;
    }
  }, [checkoutState.redirectUrl]);

  const awaitingCheckout = settlements.find(
    (settlement) =>
      settlement.status === "AWAITING_PAYMENT" &&
      settlement.provider === "paymongo"
  );

  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Bunal.club service-fee settlement
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Automatic and approved manual bookings accrue their displayed
            service fee here. Remit the combined balance; after settlement,
            you retain exactly your advertised court and registration rates.
          </p>
        </div>
        {balance.blocked ? (
          <Badge tone="danger">Overdue</Badge>
        ) : balance.inEnforcementGrace ? (
          <Badge tone="warn">3-day grace period</Badge>
        ) : balance.pending > 0 ? (
          <Badge tone="warn">Under review</Badge>
        ) : (
          <Badge tone="success">Current</Badge>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-[11px] text-gray-500">Outstanding</dt>
          <dd className="mt-1 text-lg font-bold text-gray-900">
            {formatPHP(balance.amountDue)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-[11px] text-gray-500">Under review</dt>
          <dd className="mt-1 text-lg font-bold text-gray-900">
            {formatPHP(balance.pending)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-[11px] text-gray-500">Settled</dt>
          <dd className="mt-1 text-lg font-bold text-gray-900">
            {formatPHP(balance.paid)}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-[11px] text-gray-500">Next deadline</dt>
          <dd className="mt-1 text-sm font-semibold text-gray-900">
            {balance.nextDueAt ? formatDate(balance.nextDueAt) : "No balance"}
          </dd>
        </div>
      </dl>

      {balance.blocked && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {formatPHP(balance.overdueAmount)} is overdue. New paid bookings are
          paused until a settlement is paid or your submitted transfer is
          approved.
        </p>
      )}
      {balance.inEnforcementGrace && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          {formatPHP(balance.overdueAmount)} is overdue. Your hubs remain active
          until {balance.enforcementAt ? formatDate(balance.enforcementAt) : "the end of the grace period"}.
          Complete settlement before then to avoid a booking pause.
        </p>
      )}
      {balance.pending > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          {formatPHP(balance.pending)} is under admin review. It will reduce
          your balance only after approval; an existing overdue restriction
          remains in place during review.
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
        >
          {state.success}
        </p>
      )}
      {state.message && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}
      {checkoutState.success && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
        >
          {checkoutState.success}
        </p>
      )}
      {checkoutState.message && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {checkoutState.message}
        </p>
      )}

      {readOnly && balance.amountDue > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Settlement payment and receipt submission must be completed by the
          partner from their own signed-in session.
        </p>
      )}

      {!readOnly && balance.amountDue > 0 && balance.pending < 0.01 && (
        <div className="mt-4 flex flex-col gap-4">
          {paymongoSettlementEnabled && (
            <form
              action={checkoutAction}
              className="rounded-xl border border-primary/20 bg-primary-soft p-3.5"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                Pay {formatPHP(balance.amountDue)} with PayMongo
              </h3>
              <p className="mt-1 text-xs text-gray-600">
                Pay by QR Ph in the secure exact-amount checkout. Payment is
                confirmed automatically.
              </p>
              <Button
                type="submit"
                disabled={startingCheckout}
                className="mt-3 sm:w-fit sm:px-6"
              >
                {startingCheckout
                  ? "Opening PayMongo…"
                  : awaitingCheckout
                    ? "Continue PayMongo payment"
                    : "Pay with QR Ph"}
              </Button>
            </form>
          )}

          {!awaitingCheckout && (
            <form action={action} className="flex flex-col gap-3.5 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {paymongoSettlementEnabled
                    ? "Or submit a manual transfer"
                    : `Submit settlement for ${formatPHP(balance.amountDue)}`}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {paymentInstructions}
                </p>
              </div>
              <Input
                label="Payment reference"
                name="paymentReference"
                placeholder="Bank, GCash, or PayMongo reference"
                error={state.errors?.paymentReference}
              />
              <ReceiptUpload error={state.errors?.receiptImage} />
              <Button
                type="submit"
                disabled={pending}
                className="sm:w-fit sm:px-6"
              >
                {pending ? "Submitting…" : "Submit for review"}
              </Button>
            </form>
          )}
        </div>
      )}

      {settlements.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Settlement history
          </h3>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-100">
            {settlements.map((settlement) => {
              const meta = statusMeta[settlement.status];
              return (
                <div
                  key={settlement.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm last:border-b-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatPHP(settlement.amount)}
                      {settlement.paymentReference
                        ? ` · ${settlement.paymentReference}`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {settlement.status === "AWAITING_PAYMENT"
                        ? "Started"
                        : "Submitted"}{" "}
                      {formatDate(settlement.submittedAt)}
                      {settlement.reviewNote
                        ? ` · ${settlement.reviewNote}`
                        : ""}
                    </p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
