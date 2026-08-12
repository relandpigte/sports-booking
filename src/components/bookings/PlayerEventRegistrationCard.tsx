import Link from "next/link";

import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { PlayerEventRegistrationView } from "@/lib/events";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

const statusLabels = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
} as const;

const statusTones: Record<
  PlayerEventRegistrationView["status"],
  BadgeTone
> = {
  PENDING: "warn",
  CONFIRMED: "success",
  WAITLISTED: "primary",
  CANCELLED: "danger",
  EXPIRED: "neutral",
};

export function PlayerEventRegistrationCard({
  registration,
}: {
  registration: PlayerEventRegistrationView;
}) {
  const { event, payment } = registration;
  const courtNames = event.courts.map((court) => court.name).join(", ");
  const livePaymentHold =
    registration.status === "PENDING" &&
    payment?.status === "PENDING" &&
    registration.secondsLeft > 0;
  const manualProofPending =
    registration.status === "PENDING" &&
    payment?.status === "PENDING" &&
    payment.manualSubmittedAt != null;
  const paidExpired =
    registration.status === "EXPIRED" && payment?.status === "SUCCEEDED";

  return (
    <article className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={event.hub.logo} name={event.hub.name} size={40} />
          <div className="min-w-0">
            <Link
              href={`/events/${event.publicId}`}
              className="font-semibold text-navy hover:underline"
            >
              {event.title}
            </Link>
            <p className="truncate text-sm text-gray-500">{event.hub.name}</p>
          </div>
        </div>
        <Badge tone={statusTones[registration.status]}>
          {manualProofPending
            ? "Pending approval"
            : statusLabels[registration.status]}
        </Badge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Date & time
          </dt>
          <dd className="mt-1 font-medium text-slate-700">
            {formatManilaDateLong(event.date)}
          </dd>
          <dd className="text-xs text-slate-500">
            {formatSlotRange(event.startHour, event.endHour)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Sport & courts
          </dt>
          <dd className="mt-1 font-medium capitalize text-slate-700">
            {event.sport}
          </dd>
          <dd className="truncate text-xs text-slate-500">{courtNames}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div>
          <p className="text-xs text-slate-500">Registration fee</p>
          <p className="font-semibold text-navy">
            {event.registrationFee > 0
              ? formatPHP(event.registrationFee)
              : "Free"}
          </p>
          {payment && (
            <p className="text-xs text-slate-400">
              Payment: {manualProofPending ? "pending approval" : payment.status.toLowerCase()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {registration.status === "CONFIRMED" && event.status === "PUBLISHED" && (
            <Link
              href="/dashboard/messages"
              className="rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
            >
              Event discussion
            </Link>
          )}
          {livePaymentHold && registration.holdExpiresAt && (
            <HoldCountdown
              expiresAt={registration.holdExpiresAt.toISOString()}
              initialSeconds={registration.secondsLeft}
            />
          )}
          {livePaymentHold && payment ? (
            <Link
              href={`/events/${event.publicId}/pay/${payment.id}`}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-hover"
            >
              Complete payment
            </Link>
          ) : paidExpired ? (
            <Link
              href={`/events/${event.publicId}`}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-hover"
            >
              Restore registration
            </Link>
          ) : (
            <Link
              href={`/events/${event.publicId}`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-slate-50"
            >
              View event
            </Link>
          )}
        </div>
      </div>

      {(event.status === "CANCELLED" || registration.status === "CANCELLED") &&
        (event.cancelReason || registration.cancelReason) && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {event.cancelReason ?? registration.cancelReason}
          </p>
        )}
    </article>
  );
}
