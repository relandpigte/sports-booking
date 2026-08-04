"use client";

import { useActionState } from "react";
import Link from "next/link";

import { formatPHP } from "@/lib/currency";
import {
  registerForEventAction,
  type EventFormState,
} from "@/lib/event-actions";

const initialState: EventFormState = {};

export function EventRegistrationPanel({
  publicId,
  fee,
  serviceFee,
  signedIn,
  viewerRole,
  registration,
  full,
  closed,
}: {
  publicId: string;
  fee: number;
  serviceFee: number;
  signedIn: boolean;
  viewerRole?: "ADMIN" | "PLAYER" | "PARTNER";
  registration: {
    status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "EXPIRED";
    paymentId: string | null;
  } | null;
  full: boolean;
  closed: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    registerForEventAction,
    initialState
  );
  const total = fee + serviceFee;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        <h2 className="text-xl font-black uppercase tracking-tight text-navy">
          Join event
        </h2>

        {full && !closed && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-bold text-amber-900">Event is full</p>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              New players can join the free waitlist and claim a spot if one opens.
            </p>
          </div>
        )}

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Registration fee</dt>
            <dd className="font-bold text-navy">{formatPHP(fee)}</dd>
          </div>
          {serviceFee > 0 && (
            <div className="flex justify-between gap-4 text-primary">
              <dt>Bunal service fee (3%)</dt>
              <dd className="font-bold">{formatPHP(serviceFee)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <dt className="font-black uppercase text-navy">Total</dt>
            <dd className="text-2xl font-black text-navy">{formatPHP(total)}</dd>
          </div>
        </dl>
        {fee > 0 && (
          <p className="mt-4 text-xs leading-5 text-slate-400">
            PayMongo may add a method-specific processing fee on its hosted checkout.
          </p>
        )}

        <div className="mt-7">
          {state.message && (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {state.message}
            </p>
          )}
          {state.success && (
            <p role="status" className="mb-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {state.success}
            </p>
          )}

          {closed ? (
            <StatusBox tone="neutral">Registration is closed.</StatusBox>
          ) : registration?.status === "CONFIRMED" ? (
            <StatusBox tone="success">You&apos;re confirmed for this event.</StatusBox>
          ) : registration?.status === "PENDING" && registration.paymentId ? (
            <Link
              href={`/events/${publicId}/pay/${registration.paymentId}`}
              className="block rounded-2xl bg-primary px-4 py-4 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
            >
              Complete payment
            </Link>
          ) : registration?.status === "WAITLISTED" && full ? (
            <StatusBox tone="success">
              You&apos;re on the free waitlist. Check back if a spot opens.
            </StatusBox>
          ) : !signedIn ? (
            <div className="space-y-3">
              <Link
                href={`/register?next=${encodeURIComponent(`/events/${publicId}`)}`}
                className="block rounded-2xl bg-primary px-4 py-4 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                {full ? "Create account to join waitlist" : "Create account to register"}
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(`/events/${publicId}`)}`}
                className="block rounded-2xl border border-navy px-4 py-3.5 text-center text-sm font-bold text-navy transition-colors hover:bg-navy-soft"
              >
                {full ? "Log in to join waitlist" : "Log in to your account"}
              </Link>
            </div>
          ) : viewerRole !== "PLAYER" ? (
            <StatusBox tone="neutral">Use a player account to register.</StatusBox>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="publicId" value={publicId} />
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {pending
                  ? "Saving your spot…"
                  : registration?.status === "WAITLISTED" && !full
                    ? "Claim available spot"
                    : full
                      ? "Join free waitlist"
                      : fee > 0
                        ? "Register and continue to payment"
                        : "Register for free"}
              </button>
            </form>
          )}
        </div>
      </div>
      <div className="border-t border-slate-100 bg-navy-soft/30 px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {fee > 0 ? "Secure payments by PayMongo" : "Free registration · no payment required"}
      </div>
    </div>
  );
}

function StatusBox({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "neutral";
}) {
  return (
    <p
      className={`rounded-2xl px-4 py-4 text-sm font-semibold ${
        tone === "success"
          ? "bg-green-50 text-green-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </p>
  );
}
