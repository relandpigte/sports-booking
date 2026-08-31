/* eslint-disable @next/next/no-img-element */
"use client";

import { useActionState, useState } from "react";

import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { PaymentStatusPoller } from "@/components/bookings/PaymentStatusPoller";
import { ReceiptUpload } from "@/components/partner/ReceiptUpload";
import { usePwa } from "@/components/pwa/PwaProvider";
import { formatPHP } from "@/lib/currency";
import {
  payTrainerSessionAction,
  submitTrainerManualProofAction,
  type TrainerPaymentState,
} from "@/lib/trainer-payment-actions";

const initial: TrainerPaymentState = {};

type TrainerCheckoutPayment = {
  id: string;
  amount: number;
  trainerAmount: number;
  platformFee: number;
  processingFee: number;
  processingFeeResponsibility: "PLAYER" | "BUNAL";
  expiresAt: string;
  initialSeconds: number;
  chargeInFlight: boolean;
  collectionMode: "AUTOMATIC" | "MANUAL";
  qrImageUrl: string | null;
  redirectUrl: string | null;
  failureMessage: string | null;
  manualSubmittedAt: string | null;
  manualMethodLabel: string | null;
  manualAccountName: string | null;
  manualAccountDetails: string | null;
  manualInstructions: string | null;
  manualQrImage: string | null;
};

type TrainerCheckoutSummary = {
  trainerName: string;
  dateLabel: string;
  timeLabel: string;
  hours: number;
};

function Result({ state }: { state: TrainerPaymentState }) {
  const message = state.success ?? state.message;
  if (!message) return null;

  return (
    <p
      role={state.success ? "status" : "alert"}
      className={`rounded-xl px-4 py-3 text-sm ${
        state.success
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {message}
    </p>
  );
}

export function TrainerCheckout({
  payment,
  summary,
}: {
  payment: TrainerCheckoutPayment;
  summary: TrainerCheckoutSummary;
}) {
  const [payState, payAction, paying] = useActionState(
    payTrainerSessionAction,
    initial
  );
  const [proofState, proofAction, submitting] = useActionState(
    submitTrainerManualProofAction,
    initial
  );
  const [receiptReady, setReceiptReady] = useState(false);
  const { isOnline } = usePwa();
  const qrImageUrl = payState.qrImageUrl ?? payment.qrImageUrl;
  const redirectUrl = payState.redirectUrl ?? payment.redirectUrl;
  const chargeInFlight =
    payment.chargeInFlight || Boolean(qrImageUrl || redirectUrl || payState.success);

  if (payment.manualSubmittedAt || proofState.success) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-xl text-white">
          ✓
        </div>
        <h1 className="mt-3 text-xl font-black text-navy">Proof submitted</h1>
        <p className="mt-1 text-sm font-bold text-amber-800">
          Pending session · trainer review
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
          Your session time stays protected while {summary.trainerName} checks
          your receipt. Exact meeting instructions unlock after approval.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PaymentStatusPoller
        paymentId={payment.id}
        initialStatus="PENDING"
        initialChargeInFlight={chargeInFlight}
        statusBasePath="/api/trainer-payments"
      />

      <header className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
          Trainer session payment
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-navy sm:text-4xl">
          Complete your session
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
          {payment.collectionMode === "MANUAL"
            ? `Transfer the exact amount to ${summary.trainerName}, then upload your receipt before the payment window expires.`
            : "Pay the exact amount by QR Ph, then keep this page open while your payment confirms automatically."}
        </p>
      </header>

      <SessionStrip payment={payment} summary={summary} />

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">
            Payment deadline
          </p>
          <p className="mt-1 text-sm leading-5 text-amber-800">
            Complete payment before time runs out or these trainer hours will be
            released.
          </p>
        </div>
        <HoldCountdown
          expiresAt={payment.expiresAt}
          initialSeconds={payment.initialSeconds}
          label="Time left"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
        <div className="space-y-6">
          {payment.collectionMode === "AUTOMATIC" ? (
            <AutomaticTrainerPayment
              payment={payment}
              payState={payState}
              payAction={payAction}
              paying={paying}
              isOnline={isOnline}
              qrImageUrl={qrImageUrl}
              redirectUrl={redirectUrl}
            />
          ) : (
            <ManualTrainerPayment
              payment={payment}
              proofState={proofState}
              proofAction={proofAction}
              submitting={submitting}
              receiptReady={receiptReady}
              onReceiptReady={setReceiptReady}
            />
          )}
        </div>

        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-8">
          <SessionSummary payment={payment} summary={summary} />
          <section className="rounded-2xl border border-primary/20 bg-primary-soft p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
              After payment
            </p>
            <p className="mt-2 text-xs leading-5 text-navy/70">
              {payment.collectionMode === "MANUAL"
                ? `The session remains pending until ${summary.trainerName} approves your receipt.`
                : "Confirmation happens automatically after your bank processes the payment."}{" "}
              Exact meeting instructions appear only after confirmation.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function AutomaticTrainerPayment({
  payment,
  payState,
  payAction,
  paying,
  isOnline,
  qrImageUrl,
  redirectUrl,
}: {
  payment: TrainerCheckoutPayment;
  payState: TrainerPaymentState;
  payAction: (formData: FormData) => void;
  paying: boolean;
  isOnline: boolean;
  qrImageUrl: string | null;
  redirectUrl: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
      <SectionHeading step="1" title="Pay with QR Ph" />
      <div className="p-5 sm:p-6">
        {qrImageUrl || redirectUrl ? (
          <PayMongoCheckout
            qrImageUrl={qrImageUrl}
            checkoutUrl={redirectUrl}
            expiresAt={payment.expiresAt}
            initialSeconds={payment.initialSeconds}
          />
        ) : payment.chargeInFlight ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            Payment is processing. Keep this page open while PayMongo confirms
            the result.
          </div>
        ) : (
          <form action={payAction} className="space-y-4">
            <input type="hidden" name="paymentId" value={payment.id} />
            <p className="rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 text-gray-600">
              Pay by <span className="font-semibold text-gray-900">QR Ph</span>{" "}
              through PayMongo. The exact-amount code appears here and confirms
              automatically.
            </p>
            {(payment.failureMessage || payState.message || payState.success) && (
              <Result
                state={
                  payState.message || payState.success
                    ? payState
                    : { message: payment.failureMessage ?? undefined }
                }
              />
            )}
            <button
              disabled={paying || !isOnline}
              className="w-full rounded-xl bg-primary px-5 py-4 text-sm font-black text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!isOnline
                ? "Reconnect to pay"
                : paying
                  ? "Preparing QR Ph…"
                  : `Generate QR Ph code · ${formatPHP(payment.amount)}`}
            </button>
            <p className="text-center text-xs text-slate-400">
              The trainer fee goes directly to the trainer&apos;s connected
              PayMongo account.
            </p>
          </form>
        )}
        {(qrImageUrl || redirectUrl) && <Result state={payState} />}
      </div>
    </section>
  );
}

function ManualTrainerPayment({
  payment,
  proofState,
  proofAction,
  submitting,
  receiptReady,
  onReceiptReady,
}: {
  payment: TrainerCheckoutPayment;
  proofState: TrainerPaymentState;
  proofAction: (formData: FormData) => void;
  submitting: boolean;
  receiptReady: boolean;
  onReceiptReady: (ready: boolean) => void;
}) {
  return (
    <form action={proofAction} className="space-y-6">
      <input type="hidden" name="paymentId" value={payment.id} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
        <SectionHeading step="1" title="Upload payment receipt" />
        <div className="space-y-5 p-5 sm:p-6">
          <ReceiptUpload
            error={proofState.errors?.receiptImage}
            variant="checkout"
            onValueChange={(value) => onReceiptReady(Boolean(value))}
          />
          <label className="block text-sm font-semibold text-slate-700">
            Transaction or reference number{" "}
            <span className="font-normal text-slate-400">(optional)</span>
            <input
              name="paymentRef"
              maxLength={120}
              placeholder="e.g. 0012 345 678901"
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy shadow-sm focus:border-primary focus:outline-none"
            />
          </label>
          <Result state={proofState} />
          <button
            disabled={submitting || !receiptReady}
            className="w-full rounded-xl bg-primary px-5 py-4 text-sm font-black text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? "Submitting proof…" : "Submit payment proof"}
          </button>
          {!receiptReady && (
            <p className="text-center text-xs text-slate-400">
              Upload your payment receipt to continue.
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
        <SectionHeading step="2" title="Trainer payment details" />
        <div className="p-5 sm:p-6">
          <div className="grid gap-6 rounded-2xl border border-navy/10 bg-navy-soft/55 p-5 sm:p-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
            {payment.manualQrImage ? (
              <div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <img
                    src={payment.manualQrImage}
                    alt={`${payment.manualMethodLabel ?? "Trainer"} payment QR`}
                    className="aspect-square w-full object-cover"
                  />
                </div>
                <a
                  href={payment.manualQrImage}
                  download="trainer-payment-qr.png"
                  className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl border border-navy/10 bg-white px-3 text-xs font-bold text-primary transition-colors hover:bg-primary-soft"
                >
                  Save QR image
                </a>
                <p className="mt-3 rounded-xl border border-primary/20 bg-primary-soft px-3 py-2.5 text-[11px] leading-4 text-navy/70">
                  Paying on this device? Save the QR and import it into your
                  banking or e-wallet app.
                </p>
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-navy/15 bg-white/60 p-5 text-center text-xs font-semibold text-slate-400">
                Use the account details to complete your transfer.
              </div>
            )}

            <dl className="min-w-0 space-y-5 text-sm">
              <div>
                <dt className="text-xs font-black uppercase tracking-[0.14em] text-navy/50">
                  Transfer exactly
                </dt>
                <dd className="mt-1 font-mono text-3xl font-black tracking-tight text-navy">
                  {formatPHP(payment.amount)}
                </dd>
              </div>
              <Detail
                label="Payment method"
                value={payment.manualMethodLabel ?? "Trainer payment"}
              />
              {payment.manualAccountName && (
                <Detail label="Account name" value={payment.manualAccountName} />
              )}
              {payment.manualAccountDetails && (
                <Detail
                  label="Account details"
                  value={payment.manualAccountDetails}
                  mono
                />
              )}
              {payment.manualInstructions && (
                <div className="border-t border-navy/10 pt-4">
                  <dt className="text-xs font-bold text-slate-500">
                    Trainer instructions
                  </dt>
                  <dd className="mt-1 whitespace-pre-line leading-6 text-navy">
                    {payment.manualInstructions}
                  </dd>
                </div>
              )}
              <p className="border-t border-navy/10 pt-4 text-xs leading-5 text-slate-500">
                The total includes Bunal.club&apos;s 3% non-refundable service
                fee. No PayMongo processing fee is added.
              </p>
            </dl>
          </div>
        </div>
      </section>
    </form>
  );
}

function SessionStrip({
  payment,
  summary,
}: {
  payment: TrainerCheckoutPayment;
  summary: TrainerCheckoutSummary;
}) {
  return (
    <section className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-primary">
          {summary.trainerName}
        </p>
        <p className="mt-1 text-sm font-semibold text-navy">
          {summary.dateLabel} · {summary.timeLabel}
        </p>
      </div>
      <div className="shrink-0 sm:text-right">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary/70">
          Exact total
        </p>
        <p className="mt-0.5 font-mono text-2xl font-black text-navy">
          {formatPHP(payment.amount)}
        </p>
      </div>
    </section>
  );
}

function SessionSummary({
  payment,
  summary,
}: {
  payment: TrainerCheckoutPayment;
  summary: TrainerCheckoutSummary;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <h2 className="text-xs font-black uppercase tracking-[0.14em] text-navy">
          Session summary
        </h2>
      </div>
      <div className="p-5">
        <p className="font-black text-navy">{summary.trainerName}</p>
        <div className="mt-4 border-y border-slate-100 py-4">
          <p className="text-sm font-semibold text-navy">Trainer session</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {summary.dateLabel}
            <br />
            {summary.timeLabel} · {summary.hours}{" "}
            {summary.hours === 1 ? "hour" : "hours"}
          </p>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <SummaryLine
            label="Trainer session"
            amount={payment.trainerAmount}
          />
          <SummaryLine label="Bunal fee (3%)" amount={payment.platformFee} />
          {payment.processingFeeResponsibility === "PLAYER" &&
            payment.processingFee > 0 && (
            <SummaryLine
              label="PayMongo processing fee"
              amount={payment.processingFee}
            />
            )}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 font-black text-navy">
            <dt>Total</dt>
            <dd>{formatPHP(payment.amount)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function SummaryLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="shrink-0 text-navy">{formatPHP(amount)}</dd>
    </div>
  );
}

function SectionHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-navy">
        <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[10px] text-white">
          {step}
        </span>
        {title}
      </h2>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className={`mt-1 font-semibold text-navy ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
