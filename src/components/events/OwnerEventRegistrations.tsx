"use client";

import { useActionState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { formatPHP } from "@/lib/currency";
import {
  cancelEventRegistrationAction,
  removeOrganizerEventGuestAction,
  type EventFormState,
} from "@/lib/event-actions";
import type {
  OwnerEventOrganizerGuestView,
  OwnerEventRegistrationView,
} from "@/lib/events";

const initialState: EventFormState = {};

export type OwnerEventParticipant =
  | {
      kind: "registration";
      createdAt: Date;
      registration: OwnerEventRegistrationView;
    }
  | {
      kind: "organizerGuest";
      createdAt: Date;
      guest: OwnerEventOrganizerGuestView;
    };

export function OwnerEventRegistrations({
  participants,
  canManage = true,
}: {
  participants: OwnerEventParticipant[];
  canManage?: boolean;
}) {
  if (participants.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">
        No player registrations or organizer guests yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {participants.map((participant) =>
        participant.kind === "registration" ? (
          <RegistrationRow
            key={`registration-${participant.registration.id}`}
            registration={participant.registration}
            canManage={canManage}
          />
        ) : (
          <OrganizerGuestRow
            key={`organizer-guest-${participant.guest.id}`}
            guest={participant.guest}
            canManage={canManage}
          />
        )
      )}
    </div>
  );
}

function RegistrationRow({
  registration,
  canManage,
}: {
  registration: OwnerEventRegistrationView;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    cancelEventRegistrationAction,
    initialState
  );
  const name =
    registration.player.playerName ?? registration.player.name ?? "Player";
  const active = ["CONFIRMED", "PENDING", "WAITLISTED"].includes(
    registration.status
  );
  const refundable =
    registration.payment?.status === "SUCCEEDED" ||
    registration.additionalPayments.some(
      (payment) => payment.status === "SUCCEEDED"
    );

  return (
    <div className="py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar src={registration.player.image} name={name} size={42} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-bold text-navy">{name}</p>
              {registration.player.isGuest && (
                <span className="rounded-full bg-ocean/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-ocean">
                  Guest checkout
                </span>
              )}
            </div>
            <p className="truncate text-xs text-slate-500">
              {registration.player.email}
            </p>
            {registration.player.phone && (
              <p className="truncate text-xs text-slate-500">
                {registration.player.phone}
              </p>
            )}
            {registration.guestNames.length > 0 ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Guests: {registration.guestNames.join(", ")}
              </p>
            ) : null}
            {registration.pendingGuestNames.length > 0 ? (
              <p className="mt-1 text-xs leading-5 text-amber-700">
                In checkout: {registration.pendingGuestNames.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
        {registration.slotCount > 0 ? (
          <span className="w-fit rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
            {registration.slotCount}{" "}
            {registration.slotCount === 1 ? "spot" : "spots"}
          </span>
        ) : null}
        <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
          {registration.status}
        </span>
        {canManage && active ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input
              type="hidden"
              name="registrationId"
              value={registration.id}
            />
            <input
              type="hidden"
              name="reason"
              value="Cancelled by the event organizer."
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                name="refund"
                value="full"
                defaultChecked={refundable}
                disabled={!refundable}
              />
              Refund (payment fee retained)
            </label>
            <button
              disabled={pending}
              className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {pending ? "Updating…" : "Cancel registration"}
            </button>
          </form>
        ) : null}
      </div>
      {state.message || state.success ? (
        <p
          className={`mt-2 text-xs font-medium ${
            state.success ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.success ?? state.message}
        </p>
      ) : null}
    </div>
  );
}

function OrganizerGuestRow({
  guest,
  canManage,
}: {
  guest: OwnerEventOrganizerGuestView;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    removeOrganizerEventGuestAction,
    initialState
  );
  const active = guest.status === "CONFIRMED";

  return (
    <div className="py-4">
      <div className="flex flex-col gap-4 rounded-xl bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={guest.name} size={42} className="bg-navy text-white" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-bold text-navy">{guest.name}</p>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">
                Added by organizer
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              No player account or payment attached
              {guest.serviceFeeCharged > 0
                ? ` · ${formatPHP(guest.serviceFeeCharged)} service fee ${guest.serviceFeeReversed ? "reversed" : "accrued"}`
                : " · No service fee due"}
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
          Complimentary
        </span>
        <span
          className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
            active
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {guest.status}
        </span>
        {canManage && active ? (
          <form action={action}>
            <input type="hidden" name="guestId" value={guest.id} />
            <button
              disabled={pending}
              className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {pending ? "Removing…" : "Remove guest"}
            </button>
          </form>
        ) : null}
      </div>
      {state.message || state.success ? (
        <p
          className={`mt-2 text-xs font-medium ${
            state.success ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.success ?? state.message}
        </p>
      ) : null}
    </div>
  );
}
