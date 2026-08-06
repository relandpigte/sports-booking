"use client";

import { useActionState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { cancelEventRegistrationAction, type EventFormState } from "@/lib/event-actions";
import type { OwnerEventRegistrationView } from "@/lib/events";

const initialState: EventFormState = {};

export function OwnerEventRegistrations({ registrations }: { registrations: OwnerEventRegistrationView[] }) {
  if (registrations.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">No player registrations yet.</p>;
  }
  return <div className="divide-y divide-slate-100">{registrations.map((registration) => <RegistrationRow key={registration.id} registration={registration} />)}</div>;
}

function RegistrationRow({ registration }: { registration: OwnerEventRegistrationView }) {
  const [state, action, pending] = useActionState(cancelEventRegistrationAction, initialState);
  const name = registration.player.playerName ?? registration.player.name ?? "Player";
  const active = ["CONFIRMED", "PENDING", "WAITLISTED"].includes(registration.status);
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
            <p className="truncate font-bold text-navy">{name}</p>
            <p className="truncate text-xs text-slate-500">
              {registration.player.email}
            </p>
            {registration.guestNames.length > 0 && (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Guests: {registration.guestNames.join(", ")}
              </p>
            )}
            {registration.pendingGuestNames.length > 0 && (
              <p className="mt-1 text-xs leading-5 text-amber-700">
                In checkout: {registration.pendingGuestNames.join(", ")}
              </p>
            )}
          </div>
        </div>
        {registration.slotCount > 0 && (
          <span className="w-fit rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
            {registration.slotCount} {registration.slotCount === 1 ? "spot" : "spots"}
          </span>
        )}
        <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">{registration.status}</span>
        {active && (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="registrationId" value={registration.id} />
            <input type="hidden" name="reason" value="Cancelled by the event organizer." />
            <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" name="refund" value="full" defaultChecked={refundable} disabled={!refundable} /> Refund</label>
            <button disabled={pending} className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">{pending ? "Updating…" : "Cancel registration"}</button>
          </form>
        )}
      </div>
      {(state.message || state.success) && <p className={`mt-2 text-xs font-medium ${state.success ? "text-emerald-700" : "text-red-600"}`}>{state.success ?? state.message}</p>}
    </div>
  );
}
