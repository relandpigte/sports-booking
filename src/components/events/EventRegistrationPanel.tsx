"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  bookingServiceFeeFor,
  MANUAL_SERVICE_FEE_PERCENT,
  manualBookingServiceFeeFor,
  SERVICE_FEE_PERCENT,
} from "@/lib/constants";
import { formatPHP } from "@/lib/currency";
import {
  addEventGuestSlotsAction,
  registerForEventAction,
  type EventFormState,
} from "@/lib/event-actions";

const initialState: EventFormState = {};

type Registration = {
  status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "EXPIRED";
  paymentId: string | null;
  paymentStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | null;
  confirmedGuestNames: string[];
  confirmedSlotCount: number;
  pendingGuestPaymentId: string | null;
};

export function EventRegistrationPanel({
  publicId,
  fee,
  paymentMode,
  signedIn,
  viewerName,
  viewerRole,
  registration,
  remainingSpots,
  full,
  closed,
}: {
  publicId: string;
  fee: number;
  paymentMode: "AUTOMATIC" | "MANUAL";
  signedIn: boolean;
  viewerName: string;
  viewerRole?: "ADMIN" | "PLAYER" | "PARTNER";
  registration: Registration | null;
  remainingSpots: number;
  full: boolean;
  closed: boolean;
}) {
  const [registerState, registerAction, registerPending] = useActionState(
    registerForEventAction,
    initialState
  );
  const [addState, addAction, addPending] = useActionState(
    addEventGuestSlotsAction,
    initialState
  );

  const confirmed = registration?.status === "CONFIRMED";
  const pendingAddOn = registration?.pendingGuestPaymentId;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        <h2 className="text-xl font-black uppercase tracking-tight text-navy">
          Join event
        </h2>

        {full && !closed && !confirmed && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-bold text-amber-900">Event is full</p>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              New players can join the free waitlist and claim a spot if one
              opens.
            </p>
          </div>
        )}

        <div className="mt-6">
          {closed ? (
            <StatusBox tone="neutral">Registration is closed.</StatusBox>
          ) : confirmed ? (
            <div className="space-y-5">
              <StatusBox tone="success">
                You&apos;re confirmed for {registration.confirmedSlotCount}{" "}
                {registration.confirmedSlotCount === 1 ? "spot" : "spots"}.
              </StatusBox>

              {registration.confirmedGuestNames.length > 0 && (
                <div className="rounded-2xl border border-primary/15 bg-primary-soft/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                    Your guests
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm font-semibold text-navy">
                    {registration.confirmedGuestNames.map((name, index) => (
                      <li key={`${name}-${index}`}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pendingAddOn ? (
                <Link
                  href={`/events/${publicId}/pay/${pendingAddOn}`}
                  className="block rounded-2xl bg-primary px-4 py-4 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
                >
                  Continue guest payment
                </Link>
              ) : remainingSpots > 0 ? (
                <GuestSlotForm
                  action={addAction}
                  state={addState}
                  pending={addPending}
                  publicId={publicId}
                  viewerName={viewerName}
                  fee={fee}
                  paymentMode={paymentMode}
                  maxGuests={remainingSpots}
                  mode="add"
                />
              ) : (
                <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">
                  No additional spots are available.
                </p>
              )}
            </div>
          ) : registration?.status === "PENDING" && registration.paymentId ? (
            <Link
              href={`/events/${publicId}/pay/${registration.paymentId}`}
              className="block rounded-2xl bg-primary px-4 py-4 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
            >
              Continue QR Ph payment
            </Link>
          ) : registration?.status === "WAITLISTED" && full ? (
            <StatusBox tone="success">
              You&apos;re on the free waitlist. Check back if a spot opens.
            </StatusBox>
          ) : registration?.status === "EXPIRED" &&
            registration.paymentStatus === "SUCCEEDED" &&
            full ? (
            <StatusBox tone="neutral">
              Your payment was received, but the event is now full. Contact
              support so your payment can be resolved.
            </StatusBox>
          ) : !signedIn ? (
            <SignedOutActions publicId={publicId} full={full} />
          ) : viewerRole !== "PLAYER" ? (
            <StatusBox tone="neutral">Use a player account to register.</StatusBox>
          ) : full ? (
            <form action={registerAction}>
              <input type="hidden" name="publicId" value={publicId} />
              <ActionMessage state={registerState} />
              <button
                type="submit"
                disabled={registerPending}
                className="w-full rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {registerPending ? "Saving…" : "Join free waitlist"}
              </button>
            </form>
          ) : (
            <GuestSlotForm
              action={registerAction}
              state={registerState}
              pending={registerPending}
              publicId={publicId}
              viewerName={viewerName}
              fee={fee}
              paymentMode={paymentMode}
              maxGuests={Math.max(0, remainingSpots - 1)}
              mode="register"
            />
          )}
        </div>
      </div>
      <div className="border-t border-slate-100 bg-navy-soft/30 px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {fee > 0
          ? paymentMode === "MANUAL"
            ? "Direct venue payment · receipt review required"
            : "Secure payments by PayMongo"
          : "Free registration · no payment required"}
      </div>
    </div>
  );
}

function GuestSlotForm({
  action,
  state,
  pending,
  publicId,
  viewerName,
  fee,
  paymentMode,
  maxGuests,
  mode,
}: {
  action: (payload: FormData) => void;
  state: EventFormState;
  pending: boolean;
  publicId: string;
  viewerName: string;
  fee: number;
  paymentMode: "AUTOMATIC" | "MANUAL";
  maxGuests: number;
  mode: "register" | "add";
}) {
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const leadIncluded = mode === "register";
  const paidSpotCount = guestNames.length + (leadIncluded ? 1 : 0);
  const venueAmount = fee * paidSpotCount;
  const serviceFee =
    paymentMode === "MANUAL"
      ? manualBookingServiceFeeFor(venueAmount)
      : bookingServiceFeeFor(venueAmount);
  const total = venueAmount + serviceFee;
  const canSubmit = mode === "register" || guestNames.length > 0;

  function addGuest() {
    if (guestNames.length >= maxGuests) return;
    setGuestNames((current) => [...current, ""]);
  }

  function updateGuest(index: number, value: string) {
    setGuestNames((current) =>
      current.map((name, guestIndex) =>
        guestIndex === index ? value : name
      )
    );
  }

  function removeGuest(index: number) {
    setGuestNames((current) =>
      current.filter((_, guestIndex) => guestIndex !== index)
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="publicId" value={publicId} />
      <ActionMessage state={state} />

      <div className="space-y-2">
        {leadIncluded && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary-soft/40 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-primary">
              You
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-navy">
              {viewerName}
            </p>
          </div>
        )}

        {guestNames.map((name, index) => (
          <div
            key={index}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 pl-3"
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Guest {index + 1} name</span>
              <input
                type="text"
                name="guestName"
                value={name}
                onChange={(event) => updateGuest(index, event.target.value)}
                placeholder={`Guest ${index + 1} name`}
                maxLength={80}
                required
                autoComplete="off"
                className="min-h-10 w-full bg-transparent text-sm font-semibold text-navy outline-none placeholder:text-slate-400"
              />
            </label>
            <button
              type="button"
              onClick={() => removeGuest(index)}
              aria-label={`Remove guest ${index + 1}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <RemoveIcon />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addGuest}
          disabled={guestNames.length >= maxGuests}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-500 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon />
          Add guest
        </button>
        <p className="text-center text-[10px] font-bold text-primary">
          {mode === "register"
            ? `${paidSpotCount} of ${maxGuests + 1} available spots selected`
            : `${guestNames.length} of ${maxGuests} available guest spots selected`}
        </p>
      </div>

      {paidSpotCount > 0 && (
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">
              {fee > 0
                ? `${formatPHP(fee)} × ${paidSpotCount} ${paidSpotCount === 1 ? "player" : "players"}`
                : "Registration fee"}
            </dt>
            <dd className="font-bold text-navy">{formatPHP(venueAmount)}</dd>
          </div>
          {serviceFee > 0 && (
            <div className="flex justify-between gap-4 text-primary">
              <dt>
                Bunal service fee ({paymentMode === "MANUAL"
                  ? MANUAL_SERVICE_FEE_PERCENT
                  : SERVICE_FEE_PERCENT}
                %, non-refundable)
              </dt>
              <dd className="font-bold">{formatPHP(serviceFee)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <dt className="font-black uppercase text-navy">Total</dt>
            <dd className="text-2xl font-black text-navy">
              {formatPHP(total)}
            </dd>
          </div>
        </dl>
      )}

      {fee > 0 && paidSpotCount > 0 && (
        <p className="text-xs leading-5 text-slate-400">
          {paymentMode === "MANUAL"
            ? `Transfer the total, including the ${MANUAL_SERVICE_FEE_PERCENT}% Bunal service fee, and upload a receipt within 15 minutes. The organizer confirms after review; no PayMongo processing fee is added.`
            : "Pay securely with QR Ph through PayMongo. Any processing fee is shown before you complete payment."}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !canSubmit}
        className="w-full rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "Saving your spots…"
          : fee <= 0
            ? mode === "add"
              ? `Add ${guestNames.length} guest ${guestNames.length === 1 ? "spot" : "spots"}`
              : `Register ${paidSpotCount} ${paidSpotCount === 1 ? "spot" : "spots"} for free`
            : mode === "add"
              ? `Confirm ${guestNames.length} guest ${guestNames.length === 1 ? "spot" : "spots"} & Pay`
              : `Confirm ${paidSpotCount} ${paidSpotCount === 1 ? "spot" : "spots"} & Pay`}
      </button>
    </form>
  );
}

function ActionMessage({ state }: { state: EventFormState }) {
  if (state.message) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
      >
        {state.message}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700"
      >
        {state.success}
      </p>
    );
  }
  return null;
}

function SignedOutActions({
  publicId,
  full,
}: {
  publicId: string;
  full: boolean;
}) {
  const next = encodeURIComponent(`/events/${publicId}`);
  return (
    <div className="space-y-3">
      <Link
        href={`/register?next=${next}`}
        className="block rounded-2xl bg-primary px-4 py-4 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
      >
        {full ? "Create account to join waitlist" : "Create account to register"}
      </Link>
      <Link
        href={`/login?next=${next}`}
        className="block rounded-2xl border border-navy px-4 py-3.5 text-center text-sm font-bold text-navy transition-colors hover:bg-navy-soft"
      >
        {full ? "Log in to join waitlist" : "Log in to your account"}
      </Link>
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

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
