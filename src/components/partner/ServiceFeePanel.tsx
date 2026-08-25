"use client";

import { useActionState, useEffect } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ServiceFeeManualDestinations } from "@/components/payments/ServiceFeeManualDestinations";
import { ServiceFeeSettlementTabs } from "@/components/payments/ServiceFeeSettlementTabs";
import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import {
  startServiceFeeCheckoutAction,
  submitServiceFeeSettlementAction,
  type ServiceFeeFormState,
} from "@/lib/service-fee-actions";
import type {
  ServiceFeeBalance,
  ServiceFeeSettlementView,
  ServiceFeeWaiverView,
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
  waivers,
  paymongoSettlementEnabled,
  paymentInstructions,
  readOnly = false,
}: {
  balance: ServiceFeeBalance;
  settlements: ServiceFeeSettlementView[];
  waivers: ServiceFeeWaiverView[];
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
            Automatic and approved manual bookings, plus complimentary players
            added by event staff, accrue their displayed service fee here.
            Remit the combined balance; after settlement, you retain exactly
            your advertised court and registration rates.
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

      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
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
        <div className="rounded-xl bg-primary-soft p-3">
          <dt className="text-[11px] text-primary">Waived</dt>
          <dd className="mt-1 text-lg font-bold text-navy">
            {formatPHP(balance.waived)}
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
      {readOnly && balance.amountDue > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Settlement payment and receipt submission must be completed by the
          partner from their own signed-in session.
        </p>
      )}

      {!readOnly && balance.amountDue > 0 && balance.pending < 0.01 && (
        <ServiceFeeSettlementTabs
          paymongoAvailable={paymongoSettlementEnabled}
          paymongo={
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                  Recommended method
                </p>
                <h3 className="mt-1 text-sm font-bold text-navy">
                  Pay {formatPHP(balance.amountDue)} securely with QR Ph
                </h3>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">
                  Pay the exact amount through PayMongo. A successful transfer
                  is confirmed automatically, so no receipt or review
                  submission is needed.
                </p>
                {checkoutState.success && (
                  <p
                    role="status"
                    className="mt-3 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
                  >
                    {checkoutState.success}
                  </p>
                )}
                {checkoutState.message && (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  >
                    {checkoutState.message}
                  </p>
                )}
              </div>
              <form action={checkoutAction} className="shrink-0">
                <Button
                  type="submit"
                  disabled={startingCheckout}
                  className="sm:w-fit sm:px-6"
                >
                  {startingCheckout
                    ? "Opening PayMongo…"
                    : awaitingCheckout
                      ? "Continue PayMongo payment"
                      : "Pay with QR Ph"}
                </Button>
              </form>
            </div>
          }
          manual={
            <>
              <ServiceFeeManualDestinations
                amount={formatPHP(balance.amountDue)}
                qrPhAvailable={paymongoSettlementEnabled}
              />
              {awaitingCheckout ? (
                <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  A QR Ph checkout is already active. Continue it from the
                  PayMongo tab, or let it expire before submitting a manual
                  transfer for review.
                </p>
              ) : (
                <form
                  action={action}
                  className="mt-5 flex flex-col gap-3.5 border-t border-slate-100 pt-5"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Manual payment review
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-gray-900">
                      Share your transfer details
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      {paymentInstructions} Your manual payment remains pending
                      until the Bunal.club owner reviews it.
                    </p>
                  </div>
                  {state.success && (
                    <p
                      role="status"
                      className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
                    >
                      {state.success}
                    </p>
                  )}
                  {state.message && (
                    <p
                      role="alert"
                      className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
                    >
                      {state.message}
                    </p>
                  )}
                  <Input
                    label="Transaction reference"
                    name="paymentReference"
                    placeholder="Bank or GCash transaction reference"
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
            </>
          }
        />
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

      {waivers.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Waiver history
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Administrative waivers reduce service-fee dues but are not payments received by Bunal.club.
          </p>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-primary/10">
            {waivers.map((waiver) => (
              <div
                key={waiver.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 bg-primary-soft/50 px-3 py-3 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {formatPHP(waiver.amount)} waived
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Granted {formatDate(waiver.grantedAt)} · {waiver.reason}
                  </p>
                  {waiver.reversedAt ? (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      Reversed {formatDate(waiver.reversedAt)}{waiver.reversalReason ? ` · ${waiver.reversalReason}` : ""}
                    </p>
                  ) : null}
                </div>
                <Badge tone={waiver.reversedAt ? "danger" : "primary"}>
                  {waiver.reversedAt ? "Reversed" : "Active waiver"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
