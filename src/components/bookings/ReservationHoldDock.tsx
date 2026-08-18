"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePwa } from "@/components/pwa/PwaProvider";
import {
  continueHeldBookingPaymentAction,
  releaseBookingHoldAction,
  type HeldBookingActionState,
} from "@/lib/booking-payment-actions";
import type { BookingFormState } from "@/lib/booking-actions";
import { formatPHP } from "@/lib/currency";
import {
  formatHourLabel,
  formatManilaDateLong,
} from "@/lib/time";

type BookingHold = NonNullable<BookingFormState["hold"]>;

const initialActionState: HeldBookingActionState = {};

function mmss(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ReservationHoldDock({
  hold,
  onClosed,
}: {
  hold: BookingHold;
  onClosed: () => void;
}) {
  const router = useRouter();
  const { isOnline } = usePwa();
  const [secondsLeft, setSecondsLeft] = useState(hold.initialSeconds);
  const [closed, setClosed] = useState(false);
  const closureHandled = useRef(false);
  const [releaseState, releaseAction, releasing] = useActionState(
    releaseBookingHoldAction,
    initialActionState
  );
  const [paymentState, paymentAction, startingPayment] = useActionState(
    continueHeldBookingPaymentAction,
    initialActionState
  );

  useEffect(() => {
    const target = new Date(hold.expiresAt).getTime();
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hold.expiresAt]);

  useEffect(() => {
    if (!releaseState.released || closureHandled.current) return;
    closureHandled.current = true;
    setClosed(true);
    onClosed();
    router.refresh();
  }, [onClosed, releaseState.released, router]);

  useEffect(() => {
    if (secondsLeft !== 0 || closureHandled.current) return;
    closureHandled.current = true;
    setClosed(true);
    onClosed();
    router.refresh();
  }, [onClosed, router, secondsLeft]);

  const summary = useMemo(() => {
    const first = hold.lines[0];
    if (!first) return `${hold.courtHours} reserved court-hours`;
    const extra = hold.lines.length - 1;
    return `${first.courtName} · ${formatManilaDateLong(hold.date)} · ${formatHourLabel(first.startHour)}–${formatHourLabel(first.endHour)}${extra > 0 ? ` · +${extra} more` : ""}`;
  }, [hold]);

  if (closed) return null;

  const message = releaseState.message ?? paymentState.message;
  const urgent = secondsLeft <= 60;

  return (
    <section
      aria-label="Reserved booking"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-accent/60 bg-navy/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-14px_35px_rgba(16,36,58,0.22)] backdrop-blur-xl md:left-[272px]"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        {message && (
          <p
            role="alert"
            className="mb-2 rounded-lg border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100"
          >
            {message}
          </p>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 lg:flex lg:gap-5">
          <div className="flex min-w-0 items-center gap-3 lg:flex-1">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary sm:flex">
              <LockIcon />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2 className="text-sm font-black text-white sm:text-base">
                  Your slots are reserved.
                </h2>
                <p className="hidden text-sm text-white/60 xl:block">
                  Complete payment or they&apos;ll be released for other players.
                </p>
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-white/45 sm:text-xs">
                {hold.venueName} · {summary}
              </p>
            </div>
          </div>

          <div
            className={`shrink-0 rounded-xl border px-3 py-1.5 text-center sm:px-4 sm:py-2 ${
              urgent
                ? "border-red-300/30 bg-red-500/20"
                : "border-white/15 bg-white/10"
            }`}
            aria-live={urgent ? "polite" : "off"}
          >
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/45 sm:text-[9px]">
              Time left
            </p>
            <p
              className={`mt-0.5 font-mono text-base font-black tabular-nums sm:text-xl ${
                urgent ? "text-red-100" : "text-accent"
              }`}
            >
              {mmss(secondsLeft)}
            </p>
          </div>

          <div className="col-span-2 grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-2 lg:flex lg:shrink-0">
            <form action={releaseAction}>
              <input type="hidden" name="paymentId" value={hold.paymentId} />
              <button
                type="submit"
                disabled={releasing || startingPayment || !isOnline}
                className="min-h-11 w-full rounded-xl border border-white/20 bg-white/5 px-3 text-xs font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-12 sm:px-5 sm:text-sm"
              >
                {releasing ? "Releasing…" : "Release slots"}
              </button>
            </form>
            <form action={paymentAction}>
              <input type="hidden" name="paymentId" value={hold.paymentId} />
              <button
                type="submit"
                disabled={startingPayment || releasing || !isOnline || secondsLeft === 0}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-black text-white shadow-lg shadow-black/20 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-12 sm:px-6 sm:text-sm"
              >
                {startingPayment
                  ? hold.paymentMode === "MANUAL"
                    ? "Opening payment…"
                    : "Preparing QR Ph…"
                  : `Pay ${formatPHP(hold.amount)}`}
                {!startingPayment && <ArrowIcon />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="16" height="12" x="4" y="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
