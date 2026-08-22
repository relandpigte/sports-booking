/* eslint-disable @next/next/no-img-element */
"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  cancelTrainerSessionAction,
  decideTrainerSessionAction,
  rescheduleTrainerSessionAction,
  type TrainerActionState,
} from "@/lib/trainer-actions";
import {
  refundTrainerSessionAction,
  reviewTrainerManualPaymentAction,
  type TrainerPaymentState,
} from "@/lib/trainer-payment-actions";
import { formatHourLabel } from "@/lib/time";

const actionInitial: TrainerActionState = {};
const paymentInitial: TrainerPaymentState = {};
const hourOptions = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: formatHourLabel(hour) }));

function Result({ state }: { state: TrainerActionState | TrainerPaymentState }) {
  const message = state.success ?? state.message;
  return message ? <p className={`mt-2 text-xs ${state.success ? "text-green-700" : "text-red-600"}`}>{message}</p> : null;
}

export function TrainerRequestDecision({ sessionId }: { sessionId: string }) {
  const [acceptState, acceptAction, accepting] = useActionState(decideTrainerSessionAction, actionInitial);
  const [declineState, declineAction, declining] = useActionState(decideTrainerSessionAction, actionInitial);
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <form action={acceptAction}><input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="decision" value="ACCEPT" /><Button disabled={accepting}>{accepting ? "Accepting…" : "Accept request"}</Button><Result state={acceptState} /></form>
    <form action={declineAction} className="rounded-xl border border-red-100 p-3"><input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="decision" value="DECLINE" /><Textarea label="Reason" name="reason" rows={2} required error={declineState.errors?.reason} /><Button disabled={declining} variant="soft" className="mt-2 text-red-600">{declining ? "Declining…" : "Decline"}</Button><Result state={declineState} /></form>
  </div>;
}

export function TrainerManualReview({ paymentId, receiptImage, paymentRef }: { paymentId: string; receiptImage: string; paymentRef: string | null }) {
  const [state, action, pending] = useActionState(reviewTrainerManualPaymentAction, paymentInitial);
  return <form action={action} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><input type="hidden" name="paymentId" value={paymentId} /><p className="text-sm font-black text-amber-900">Review manual payment</p>{ }<img src={receiptImage} alt="Player payment receipt" className="mt-3 max-h-64 rounded-xl border border-amber-200 bg-white object-contain" />{paymentRef && <p className="mt-2 text-xs text-amber-800">Reference: {paymentRef}</p>}<Input label="Review note (optional)" name="note" /><div className="mt-3 flex gap-2"><button name="decision" value="APPROVE" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Approve</button><button name="decision" value="DECLINE" disabled={pending} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-red-600">Decline</button></div><Result state={state} /></form>;
}

export function TrainerConfirmedActions({ sessionId, currentDate, currentStartHour }: { sessionId: string; currentDate: string; currentStartHour: number }) {
  const [moveState, moveAction, moving] = useActionState(rescheduleTrainerSessionAction, actionInitial);
  const [refundState, refundAction, refunding] = useActionState(refundTrainerSessionAction, paymentInitial);
  return <div className="mt-4 grid gap-3 lg:grid-cols-2">
    <form action={moveAction} className="rounded-xl border border-slate-200 p-4"><input type="hidden" name="sessionId" value={sessionId} /><p className="text-sm font-black text-navy">Reschedule</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input label="New date" name="date" type="date" required defaultValue={currentDate} error={moveState.errors?.date} /><Select label="Start" name="startHour" defaultValue={String(currentStartHour)} options={hourOptions} /></div><Textarea label="Reason" name="reason" rows={2} required error={moveState.errors?.reason} /><Button disabled={moving} variant="soft" className="mt-2">{moving ? "Moving…" : "Move session"}</Button><Result state={moveState} /></form>
    <form action={refundAction} className="rounded-xl border border-red-100 p-4"><input type="hidden" name="sessionId" value={sessionId} /><p className="text-sm font-black text-navy">Cancel and refund</p><p className="mt-1 text-xs text-slate-500">A trainer cancellation returns the full collected amount, including Bunal&apos;s fee.</p><Textarea label="Reason" name="reason" rows={2} required error={refundState.errors?.reason} /><Button disabled={refunding} variant="soft" className="mt-2 text-red-600">{refunding ? "Refunding…" : "Cancel and refund"}</Button><Result state={refundState} /></form>
  </div>;
}

export function PlayerTrainerCancellation({ sessionId, paid }: { sessionId: string; paid: boolean }) {
  const [state, action, pending] = useActionState(paid ? refundTrainerSessionAction : cancelTrainerSessionAction, paid ? paymentInitial : actionInitial);
  return <form action={action} className="mt-4 rounded-xl border border-slate-200 p-3"><input type="hidden" name="sessionId" value={sessionId} /><Input label={paid ? "Refund reason" : "Cancellation reason"} name="reason" required /><Button disabled={pending} variant="soft" className="mt-2 sm:w-auto">{pending ? "Submitting…" : paid ? "Cancel and request eligible refund" : "Cancel request"}</Button><Result state={state} /></form>;
}

export function TrainerPendingManualRefund({ sessionId, amount }: { sessionId: string; amount: string }) {
  const [state, action, pending] = useActionState(refundTrainerSessionAction, paymentInitial);
  return <form action={action} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><input type="hidden" name="sessionId" value={sessionId} /><p className="text-sm font-black text-amber-900">Manual refund requested · ₱{amount}</p><p className="mt-1 text-xs text-amber-800">Return the trainer subtotal through the original payment network, then record it here. The 3% Bunal fee remains charged for a player cancellation.</p><Input label="Refund reference or note" name="reason" required /><Button disabled={pending} className="mt-3 sm:w-auto">{pending ? "Recording…" : "Mark manual refund returned"}</Button><Result state={state} /></form>;
}
