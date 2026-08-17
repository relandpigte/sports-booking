"use client";

import { useActionState, useEffect, useState } from "react";

import {
  recordManualRefundAction,
  reviewManualPaymentAction,
  type ManualPaymentFormState,
} from "@/lib/manual-payment-actions";
import { formatPHP } from "@/lib/currency";

const initialState: ManualPaymentFormState = {};

type ManualPaymentReviewProps = {
  payment: {
    id: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
    amount: number;
    venueAmount?: number;
    platformFee?: number;
    playerName?: string;
    receiptImage: string | null;
    methodLabel: string | null;
    paymentReference: string | null;
    submittedAt: Date | null;
    reviewNote: string | null;
    refundedAt: Date | null;
  };
  variant?: "card" | "list" | "eventTable";
};

export function ManualPaymentReview({
  payment,
  variant = "card",
}: ManualPaymentReviewProps) {
  const [state, action, pending] = useActionState(
    reviewManualPaymentAction,
    initialState
  );
  const [refundState, refundAction, refunding] = useActionState(
    recordManualRefundAction,
    initialState
  );
  const [showRefund, setShowRefund] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [note, setNote] = useState("");
  const awaitingReview = payment.status === "PENDING" && payment.submittedAt;
  const [reviewOverdue, setReviewOverdue] = useState(false);

  useEffect(() => {
    if (!awaitingReview) return;
    const overdueAt = new Date(payment.submittedAt!).getTime() + 2 * 60 * 60_000;
    const timeout = window.setTimeout(
      () => setReviewOverdue(true),
      Math.max(0, overdueAt - Date.now())
    );
    return () => window.clearTimeout(timeout);
  }, [awaitingReview, payment.submittedAt]);
  const overdueAwaitingReview = Boolean(awaitingReview && reviewOverdue);
  const reviewFormId = `manual-payment-review-${payment.id}`;

  useEffect(() => {
    if (!showReceipt) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowReceipt(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showReceipt]);

  const reviewForm = (surface: "inline" | "modal") => (
    <form
      action={action}
      className={
        surface === "modal"
          ? "space-y-3"
          : "flex min-w-0 flex-1 flex-col gap-2 lg:max-w-xl lg:flex-row lg:items-end"
      }
    >
      <input type="hidden" name="paymentId" value={payment.id} />
      <label className={surface === "modal" ? "block" : "min-w-0 flex-1"}>
        <span className="sr-only">Optional review or decline reason</span>
        <input
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Optional review or decline reason"
          className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-xs text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          name="decision"
          value="approve"
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Reviewing…" : "Approve & confirm"}
        </button>
        <button
          name="decision"
          value="decline"
          disabled={pending}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Decline & release
        </button>
      </div>
      {state.message && (
        <p className="text-xs text-red-600 lg:basis-full">{state.message}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-700 lg:basis-full">{state.success}</p>
      )}
    </form>
  );

  if (variant === "eventTable") {
    return (
      <>
        <div className="flex min-w-44 flex-col items-start gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
              Manual
            </span>
            {payment.methodLabel && (
              <span className="text-xs font-bold text-navy">
                {payment.methodLabel}
              </span>
            )}
          </div>
          {awaitingReview && (
            <p className="text-[11px] font-semibold text-amber-700">
              {overdueAwaitingReview
                ? "Review overdue"
                : "Proof awaiting review"}
            </p>
          )}
          {payment.submittedAt && (
            <p className="text-[11px] text-slate-400">
              Submitted {formatSubmittedAt(payment.submittedAt)}
            </p>
          )}
          {payment.receiptImage ? (
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className="mt-0.5 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-navy shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <ReceiptIcon />
              {awaitingReview ? "Review proof" : "View proof"}
            </button>
          ) : (
            <span className="text-xs text-slate-400">Proof unavailable</span>
          )}
        </div>

        {showReceipt && payment.receiptImage && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/70 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setShowReceipt(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`receipt-title-${payment.id}`}
              aria-describedby={`receipt-help-${payment.id}`}
              className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                    Manual payment review
                  </p>
                  <h2
                    id={`receipt-title-${payment.id}`}
                    className="mt-1 text-xl font-black text-navy"
                  >
                    Review player receipt
                  </h2>
                  {payment.playerName && (
                    <p className="mt-1 text-sm text-slate-500">
                      Submitted by {payment.playerName}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowReceipt(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-navy"
                  aria-label="Close payment review"
                  autoFocus
                >
                  ×
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.85fr)]">
                  <div className="flex min-h-72 items-center justify-center border-b border-slate-200 bg-slate-50 p-4 sm:p-6 lg:min-h-[32rem] lg:border-b-0 lg:border-r">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={payment.receiptImage}
                      alt="Full player payment receipt"
                      className="max-h-[58dvh] max-w-full rounded-xl object-contain shadow-sm"
                    />
                  </div>

                  <aside className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Transaction details
                      </p>
                      {payment.methodLabel && (
                        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                          {payment.methodLabel}
                        </span>
                      )}
                    </div>
                    <dl className="mt-4 space-y-3 text-sm">
                      {payment.playerName && (
                        <ReceiptDetail label="Player" value={payment.playerName} />
                      )}
                      <ReceiptDetail
                        label="Checkout total"
                        value={formatPHP(payment.amount)}
                        strong
                      />
                      {payment.venueAmount != null && (
                        <ReceiptDetail
                          label="Venue revenue"
                          value={formatPHP(payment.venueAmount)}
                        />
                      )}
                      {payment.platformFee != null && (
                        <ReceiptDetail
                          label="Bunal.club fee"
                          value={formatPHP(payment.platformFee)}
                        />
                      )}
                      <ReceiptDetail
                        label="Reference"
                        value={payment.paymentReference ?? "Not provided"}
                      />
                      <ReceiptDetail
                        label="Submitted"
                        value={
                          payment.submittedAt
                            ? formatSubmittedAt(payment.submittedAt)
                            : "Not available"
                        }
                      />
                    </dl>

                    {awaitingReview && (
                      <form
                        id={reviewFormId}
                        action={action}
                        className="mt-5 border-t border-slate-100 pt-5"
                      >
                        <input
                          type="hidden"
                          name="paymentId"
                          value={payment.id}
                        />
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                            Partner note (optional)
                          </span>
                          <textarea
                            name="note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            maxLength={500}
                            rows={3}
                            placeholder="Add a note or reason for declining…"
                            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                      </form>
                    )}

                    <div
                      id={`receipt-help-${payment.id}`}
                      className={`mt-4 rounded-xl px-3 py-2.5 text-xs leading-5 ${
                        awaitingReview
                          ? "bg-ocean-soft text-navy"
                          : "bg-slate-50 text-slate-600"
                      }`}
                    >
                      {awaitingReview
                        ? "Approving confirms this event registration immediately. Declining rejects the proof and releases the held event capacity."
                        : "This receipt has already been reviewed. Its recorded payment status is shown in the transaction table."}
                    </div>

                    {state.message && (
                      <p className="mt-3 text-xs font-semibold text-red-600" role="alert">
                        {state.message}
                      </p>
                    )}
                    {state.success && (
                      <p className="mt-3 text-xs font-semibold text-green-700" role="status">
                        {state.success}
                      </p>
                    )}

                    {payment.status === "SUCCEEDED" && (
                      <div className="mt-5 border-t border-slate-100 pt-5">
                        {!showRefund ? (
                          <button
                            type="button"
                            onClick={() => setShowRefund(true)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Record external refund
                          </button>
                        ) : (
                          <form action={refundAction} className="space-y-2">
                            <input
                              type="hidden"
                              name="paymentId"
                              value={payment.id}
                            />
                            <input
                              name="reference"
                              maxLength={120}
                              placeholder="Refund reference (optional)"
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <input
                              name="reason"
                              maxLength={500}
                              placeholder="Reason (optional)"
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <p className="text-xs leading-5 text-slate-600">
                              Send the full venue amount outside Bunal first,
                              then record it here.
                            </p>
                            {refundState.message && (
                              <p className="text-xs text-red-600">
                                {refundState.message}
                              </p>
                            )}
                            {refundState.success && (
                              <p className="text-xs text-green-700">
                                {refundState.success}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <button
                                disabled={refunding}
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                              >
                                Record full refund
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowRefund(false)}
                                className="px-3 py-2 text-xs font-bold text-slate-500"
                              >
                                Keep booking
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {payment.reviewNote && (
                      <p className="mt-4 text-xs leading-5 text-slate-600">
                        Review note: {payment.reviewNote}
                      </p>
                    )}
                  </aside>
                </div>
              </div>

              {awaitingReview && (
                <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                  <button
                    type="submit"
                    form={reviewFormId}
                    name="decision"
                    value="decline"
                    disabled={pending}
                    className="min-h-11 rounded-xl border border-red-200 bg-white px-5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    Decline & release spot
                  </button>
                  <button
                    type="submit"
                    form={reviewFormId}
                    name="decision"
                    value="approve"
                    disabled={pending}
                    className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pending ? "Reviewing…" : "Approve & confirm"}
                  </button>
                </footer>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div
        className={
          variant === "list"
            ? "mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
            : "mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">
              Manual payment
            </p>
            <p className="mt-1 text-sm font-bold text-navy">
              {overdueAwaitingReview
                ? "Review overdue"
                : awaitingReview
                  ? "Proof awaiting review"
                  : payment.status}
            </p>
            {overdueAwaitingReview && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                Submitted over two hours ago. Review this payment promptly.
              </p>
            )}
          </div>
          {payment.methodLabel && (
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy">
              {payment.methodLabel}
            </span>
          )}
        </div>

        <div
          className={`mt-3 ${
            variant === "list" && awaitingReview
              ? "grid gap-3 md:grid-cols-[auto_minmax(10rem,.75fr)_minmax(20rem,1.5fr)] md:items-center"
              : ""
          }`}
        >
          {payment.receiptImage && (
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className={`group relative block overflow-hidden rounded-xl border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                variant === "list" ? "h-20 w-20" : "w-full"
              }`}
              aria-label="Open full payment receipt"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={payment.receiptImage}
                alt="Player payment receipt"
                className={
                  variant === "list"
                    ? "h-full w-full object-cover"
                    : "max-h-64 w-full object-contain"
                }
              />
              <span className="absolute inset-0 flex items-center justify-center bg-navy/0 text-[11px] font-bold text-white opacity-0 transition group-hover:bg-navy/55 group-hover:opacity-100 group-focus:bg-navy/55 group-focus:opacity-100">
                Enlarge
              </span>
            </button>
          )}

          <div className={variant === "list" ? "min-w-0" : "mt-3"}>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Amount received
            </p>
            <p className="mt-0.5 text-sm font-black text-navy">
              {formatPHP(payment.amount)}
            </p>
            {payment.paymentReference && (
              <p className="mt-1 truncate text-xs text-slate-600">
                Reference: {" "}
                <span className="font-mono font-bold text-navy">
                  {payment.paymentReference}
                </span>
              </p>
            )}
            {payment.submittedAt && (
              <p className="mt-1 text-[11px] text-slate-500">
                Submitted {formatSubmittedAt(payment.submittedAt)}
              </p>
            )}
          </div>

          {awaitingReview && reviewForm("inline")}
        </div>

        {payment.status === "SUCCEEDED" && (
          <div className="mt-3 border-t border-amber-200 pt-3">
            {!showRefund ? (
              <button
                type="button"
                onClick={() => setShowRefund(true)}
                className="text-xs font-bold text-red-600"
              >
                Record external refund
              </button>
            ) : (
              <form action={refundAction} className="space-y-2">
                <input type="hidden" name="paymentId" value={payment.id} />
                <input
                  name="reference"
                  maxLength={120}
                  placeholder="Refund reference (optional)"
                  className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-xs"
                />
                <input
                  name="reason"
                  maxLength={500}
                  placeholder="Reason (optional)"
                  className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-xs"
                />
                <p className="text-xs text-slate-600">
                  Send the full venue amount outside Bunal first, then record it
                  here.
                </p>
                {refundState.message && (
                  <p className="text-xs text-red-600">{refundState.message}</p>
                )}
                {refundState.success && (
                  <p className="text-xs text-green-700">
                    {refundState.success}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    disabled={refunding}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Record full refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRefund(false)}
                    className="px-3 py-2 text-xs font-bold text-slate-500"
                  >
                    Keep booking
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {payment.reviewNote && (
          <p className="mt-3 text-xs text-slate-600">
            Review note: {payment.reviewNote}
          </p>
        )}
      </div>

      {showReceipt && payment.receiptImage && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowReceipt(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`receipt-title-${payment.id}`}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  Manual payment proof
                </p>
                <h2
                  id={`receipt-title-${payment.id}`}
                  className="mt-1 text-xl font-black text-navy"
                >
                  Review player receipt
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-xl text-slate-500 hover:bg-slate-50 hover:text-navy"
                aria-label="Close receipt preview"
                autoFocus
              >
                ×
              </button>
            </header>

            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.8fr)]">
              <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={payment.receiptImage}
                  alt="Full player payment receipt"
                  className="max-h-[65dvh] max-w-full rounded-xl object-contain"
                />
              </div>
              <aside className="self-start rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm">
                <dl className="space-y-3 text-sm">
                  <ReceiptDetail
                    label="Amount"
                    value={formatPHP(payment.amount)}
                    strong
                  />
                  <ReceiptDetail
                    label="Payment method"
                    value={payment.methodLabel ?? "Manual transfer"}
                  />
                  <ReceiptDetail
                    label="Reference"
                    value={payment.paymentReference ?? "Not provided"}
                  />
                  <ReceiptDetail
                    label="Submitted"
                    value={
                      payment.submittedAt
                        ? formatSubmittedAt(payment.submittedAt)
                        : "Not available"
                    }
                  />
                </dl>
                {awaitingReview && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {reviewForm("modal")}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReceiptDetail({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`max-w-[65%] break-words text-right ${
          strong ? "font-black text-primary" : "font-semibold text-navy"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ReceiptIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-primary"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 3 2 3-2 3 2 3-2V7Z" />
      <path d="M14 2v5h5M8 10h7M8 14h5" />
    </svg>
  );
}

function formatSubmittedAt(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}
