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
const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: formatHourLabel(hour),
}));

function Result({
  state,
}: {
  state: TrainerActionState | TrainerPaymentState;
}) {
  const message = state.success ?? state.message;
  return message ? (
    <p
      role={state.success ? "status" : "alert"}
      className={`mt-3 rounded-lg px-3 py-2 text-xs ${
        state.success
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {message}
    </p>
  ) : null;
}

export function TrainerRequestDecision({ sessionId }: { sessionId: string }) {
  const [acceptState, acceptAction, accepting] = useActionState(
    decideTrainerSessionAction,
    actionInitial
  );
  const [declineState, declineAction, declining] = useActionState(
    decideTrainerSessionAction,
    actionInitial
  );

  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <form
        action={acceptAction}
        className="rounded-xl border border-primary/20 bg-primary-soft p-4"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="decision" value="ACCEPT" />
        <ActionTitle icon="check" title="Ready to coach?" />
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Accept the request so the player can continue to checkout.
        </p>
        <Button disabled={accepting} className="mt-4 sm:w-auto sm:px-6">
          {accepting ? "Accepting…" : "Accept request"}
        </Button>
        <Result state={acceptState} />
      </form>

      <form
        action={declineAction}
        className="rounded-xl border border-red-200 bg-red-50/40 p-4"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="decision" value="DECLINE" />
        <ActionTitle icon="close" title="Can’t take this request?" danger />
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Give the player a short, useful reason before declining.
        </p>
        <div className="mt-3">
          <Textarea
            label="Reason"
            name="reason"
            rows={2}
            required
            error={declineState.errors?.reason}
          />
        </div>
        <Button
          disabled={declining}
          variant="soft"
          className="mt-3 text-red-600 sm:w-auto"
        >
          {declining ? "Declining…" : "Decline request"}
        </Button>
        <Result state={declineState} />
      </form>
    </div>
  );
}

export function TrainerManualReview({
  paymentId,
  receiptImage,
  paymentRef,
}: {
  paymentId: string;
  receiptImage: string;
  paymentRef: string | null;
}) {
  const [state, action, pending] = useActionState(
    reviewTrainerManualPaymentAction,
    paymentInitial
  );

  return (
    <form
      action={action}
      className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <ReceiptIcon />
        </span>
        <div>
          <h3 className="font-black text-amber-950">Review manual payment</h3>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Match the receipt and reference against your payment account before
            deciding.
          </p>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 md:grid-cols-[minmax(220px,320px)_1fr]">
        <a
          href={receiptImage}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl border border-amber-200 bg-white"
        >
          <img
            src={receiptImage}
            alt="Player payment receipt"
            className="max-h-72 w-full object-contain"
          />
        </a>
        <div>
          {paymentRef && (
            <div className="rounded-xl border border-amber-200 bg-white p-3">
              <p className="text-xs font-black uppercase tracking-wider text-amber-700">
                Player reference
              </p>
              <p className="mt-1 break-all text-sm font-bold text-navy">
                {paymentRef}
              </p>
            </div>
          )}
          <div className="mt-3">
            <Input label="Review note (optional)" name="note" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              name="decision"
              value="APPROVE"
              disabled={pending}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {pending ? "Reviewing…" : "Approve payment"}
            </button>
            <button
              name="decision"
              value="DECLINE"
              disabled={pending}
              className="min-h-11 rounded-xl border border-red-200 bg-white px-5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              Decline payment
            </button>
          </div>
          <Result state={state} />
        </div>
      </div>
    </form>
  );
}

export function TrainerConfirmedActions({
  sessionId,
  currentDate,
  currentStartHour,
}: {
  sessionId: string;
  currentDate: string;
  currentStartHour: number;
}) {
  const [moveState, moveAction, moving] = useActionState(
    rescheduleTrainerSessionAction,
    actionInitial
  );
  const [refundState, refundAction, refunding] = useActionState(
    refundTrainerSessionAction,
    paymentInitial
  );

  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <form
        action={moveAction}
        className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <ActionTitle icon="calendar" title="Reschedule session" />
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Choose a new date and start time, then explain the change.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="New date"
            name="date"
            type="date"
            required
            defaultValue={currentDate}
            error={moveState.errors?.date}
          />
          <Select
            label="Start"
            name="startHour"
            defaultValue={String(currentStartHour)}
            options={hourOptions}
          />
        </div>
        <Textarea
          label="Reason"
          name="reason"
          rows={2}
          required
          error={moveState.errors?.reason}
        />
        <Button disabled={moving} variant="soft" className="mt-3 sm:w-auto">
          {moving ? "Moving…" : "Move session"}
        </Button>
        <Result state={moveState} />
      </form>

      <form
        action={refundAction}
        className="rounded-xl border border-red-200 bg-red-50/40 p-4"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <ActionTitle icon="refund" title="Cancel and refund" danger />
        <p className="mt-2 text-sm leading-6 text-slate-600">
          A trainer cancellation returns the full collected amount, including
          Bunal&apos;s fee.
        </p>
        <div className="mt-3">
          <Textarea
            label="Reason"
            name="reason"
            rows={2}
            required
            error={refundState.errors?.reason}
          />
        </div>
        <Button
          disabled={refunding}
          variant="soft"
          className="mt-3 text-red-600 sm:w-auto"
        >
          {refunding ? "Refunding…" : "Cancel and refund"}
        </Button>
        <Result state={refundState} />
      </form>
    </div>
  );
}

export function PlayerTrainerCancellation({
  sessionId,
  paid,
}: {
  sessionId: string;
  paid: boolean;
}) {
  const [state, action, pending] = useActionState(
    paid ? refundTrainerSessionAction : cancelTrainerSessionAction,
    paid ? paymentInitial : actionInitial
  );

  return (
    <form
      action={action}
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <Input
        label={paid ? "Refund reason" : "Cancellation reason"}
        name="reason"
        required
      />
      <Button disabled={pending} variant="soft" className="mt-3 sm:w-auto">
        {pending
          ? "Submitting…"
          : paid
            ? "Cancel and request eligible refund"
            : "Cancel request"}
      </Button>
      <Result state={state} />
    </form>
  );
}

export function TrainerPendingManualRefund({
  sessionId,
  amount,
}: {
  sessionId: string;
  amount: string;
}) {
  const [state, action, pending] = useActionState(
    refundTrainerSessionAction,
    paymentInitial
  );

  return (
    <form
      action={action}
      className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <ActionTitle
        icon="refund"
        title={`Manual refund requested · ₱${amount}`}
      />
      <p className="mt-2 text-sm leading-6 text-amber-800">
        Return the trainer subtotal through the original payment network, then
        record it here. The 3% Bunal fee remains charged for a player
        cancellation.
      </p>
      <div className="mt-3 max-w-xl">
        <Input label="Refund reference or note" name="reason" required />
      </div>
      <Button disabled={pending} className="mt-3 sm:w-auto">
        {pending ? "Recording…" : "Mark manual refund returned"}
      </Button>
      <Result state={state} />
    </form>
  );
}

function ActionTitle({
  icon,
  title,
  danger = false,
}: {
  icon: "check" | "close" | "calendar" | "refund";
  title: string;
  danger?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${danger ? "text-red-700" : "text-navy"}`}>
      <ActionIcon type={icon} />
      <h3 className="text-sm font-black">{title}</h3>
    </div>
  );
}

function ActionIcon({
  type,
}: {
  type: "check" | "close" | "calendar" | "refund";
}) {
  if (type === "check") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="10" r="8" />
        <path d="m6.5 10 2.2 2.2 4.8-4.8" />
      </svg>
    );
  }

  if (type === "close") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="10" r="8" />
        <path d="m7 7 6 6M13 7l-6 6" />
      </svg>
    );
  }

  if (type === "calendar") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M6 2v4M14 2v4M3 8h14" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6H3v-3M3.5 6A7 7 0 1 1 3 12" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 2h10v16l-2-1.5L10 18l-3-1.5L5 18V2Z" />
      <path d="M8 6h4M8 10h4M8 14h2" />
    </svg>
  );
}
