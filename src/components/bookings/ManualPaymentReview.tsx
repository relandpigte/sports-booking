"use client";

import { useActionState, useState } from "react";

import {
  recordManualRefundAction,
  reviewManualPaymentAction,
  type ManualPaymentFormState,
} from "@/lib/manual-payment-actions";

const initialState: ManualPaymentFormState = {};

export function ManualPaymentReview({
  payment,
}: {
  payment: {
    id: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
    receiptImage: string | null;
    methodLabel: string | null;
    paymentReference: string | null;
    submittedAt: Date | null;
    reviewNote: string | null;
    refundedAt: Date | null;
  };
}) {
  const [state, action, pending] = useActionState(reviewManualPaymentAction, initialState);
  const [refundState, refundAction, refunding] = useActionState(recordManualRefundAction, initialState);
  const [showRefund, setShowRefund] = useState(false);

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">Manual payment</p>
          <p className="mt-1 text-sm font-bold text-navy">
            {payment.status === "PENDING" && payment.submittedAt ? "Proof awaiting review" : payment.status}
          </p>
        </div>
        {payment.methodLabel && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-navy">{payment.methodLabel}</span>}
      </div>
      {payment.paymentReference && <p className="mt-3 text-xs text-slate-600">Reference: <span className="font-mono font-bold text-navy">{payment.paymentReference}</span></p>}
      {payment.receiptImage && (
        <a href={payment.receiptImage} target="_blank" rel="noreferrer" className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={payment.receiptImage} alt="Player payment receipt" className="max-h-64 w-full rounded-xl border border-amber-200 bg-white object-contain" />
          <span className="mt-1 block text-xs font-bold text-primary">Open full receipt ↗</span>
        </a>
      )}
      {payment.status === "PENDING" && payment.submittedAt && (
        <form action={action} className="mt-4 space-y-3 border-t border-amber-200 pt-4">
          <input type="hidden" name="paymentId" value={payment.id} />
          <input name="note" maxLength={500} placeholder="Optional review or decline reason" className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-xs text-navy" />
          {state.message && <p className="text-xs text-red-600">{state.message}</p>}
          {state.success && <p className="text-xs text-green-700">{state.success}</p>}
          <div className="flex flex-wrap gap-2">
            <button name="decision" value="approve" disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50">Approve & confirm</button>
            <button name="decision" value="decline" disabled={pending} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Decline & release</button>
          </div>
        </form>
      )}
      {payment.status === "SUCCEEDED" && (
        <div className="mt-3 border-t border-amber-200 pt-3">
          {!showRefund ? (
            <button type="button" onClick={() => setShowRefund(true)} className="text-xs font-bold text-red-600">Record external refund</button>
          ) : (
            <form action={refundAction} className="space-y-2">
              <input type="hidden" name="paymentId" value={payment.id} />
              <input name="reference" maxLength={120} placeholder="Refund reference (optional)" className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-xs" />
              <input name="reason" maxLength={500} placeholder="Reason (optional)" className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-xs" />
              <p className="text-xs text-slate-600">Send the full venue amount outside Bunal first, then record it here.</p>
              {refundState.message && <p className="text-xs text-red-600">{refundState.message}</p>}
              {refundState.success && <p className="text-xs text-green-700">{refundState.success}</p>}
              <div className="flex gap-2">
                <button disabled={refunding} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Record full refund</button>
                <button type="button" onClick={() => setShowRefund(false)} className="px-3 py-2 text-xs font-bold text-slate-500">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {payment.reviewNote && <p className="mt-3 text-xs text-slate-600">Review note: {payment.reviewNote}</p>}
    </div>
  );
}
