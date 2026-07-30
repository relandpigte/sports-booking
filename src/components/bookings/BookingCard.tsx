import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CancelBookingButton } from "@/components/bookings/CancelBookingButton";
import { RefundBookingButton } from "@/components/bookings/RefundBookingButton";
import { RescheduleBookingButton } from "@/components/bookings/RescheduleBookingButton";
import type { BookingView } from "@/lib/bookings";
import { formatPHP } from "@/lib/currency";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONES,
  COURT_TYPE_LABELS,
  type OperatingHours,
} from "@/lib/constants";

// `player` shows the booker's details (partner view); `hub` shows the venue
// (player view). Cancel controls appear only for upcoming, confirmed bookings.
//
// `reschedule` is passed only by the partner's hub list; player surfaces omit
// it and are unaffected.
export function BookingCard({
  booking,
  view,
  cancellable,
  reschedule,
}: {
  booking: BookingView;
  view: "player" | "partner";
  cancellable: boolean;
  reschedule?: {
    courts: {
      id: string;
      name: string;
      courtType: string;
      hourlyRate: number | null;
    }[];
    operatingHours: OperatingHours | null;
    today: string;
    nowHour: number;
  };
}) {
  const cancelled = booking.status === "CANCELLED";
  // status is the EFFECTIVE one, so a lapsed hold is already EXPIRED here and
  // never offers a dead "Complete payment" link.
  const holding = booking.status === "PENDING";
  const paid = booking.payment?.status === "SUCCEEDED";
  const refunded = booking.payment?.status === "REFUNDED";

  return (
    <div className="rounded-2xl border border-gray-200 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {view === "player" ? (
            <>
              <Avatar src={booking.hub.logo} name={booking.hub.name} size={40} />
              <div className="min-w-0">
                <Link
                  href={`/hubs/${booking.hub.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {booking.hub.name}
                </Link>
                <p className="truncate text-sm text-gray-500">
                  {booking.court.name} ·{" "}
                  {COURT_TYPE_LABELS[booking.court.courtType] ??
                    booking.court.courtType}
                </p>
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <p className="font-medium text-gray-900">
                {booking.player.playerName ?? booking.player.name ?? "Player"}
              </p>
              <p className="truncate text-sm text-gray-500">
                {booking.court.name}
                {booking.player.phone ? ` · ${booking.player.phone}` : ""}
              </p>
            </div>
          )}
        </div>

        <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
          {BOOKING_STATUS_LABELS[booking.status]}
        </Badge>
      </div>

      <dl className="mt-4 flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">When</dt>
          <dd className="text-right font-medium text-gray-900">
            {formatManilaDateLong(booking.date)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Time</dt>
          <dd className="font-medium text-gray-900">
            {formatSlotRange(booking.startHour, booking.endHour)} (
            {booking.hours}
            {booking.hours === 1 ? " hr" : " hrs"})
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-500">Total</dt>
          <dd className="font-semibold text-gray-900">
            {booking.totalPrice != null
              ? formatPHP(booking.totalPrice)
              : "Rate on request"}
          </dd>
        </div>
        {booking.payment && (paid || refunded) && (
          <>
            {/* The player paid the court fee plus the service fee, so the
                figure on their card has to reconcile with their bank. */}
            {booking.payment.platformFee > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Service fee</dt>
                <dd className="text-gray-500">
                  {formatPHP(booking.payment.platformFee)}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">
                {refunded ? "Refunded" : "Paid online"}
              </dt>
              <dd className="font-medium text-gray-900">
                {formatPHP(booking.payment.amount)}
              </dd>
            </div>
          </>
        )}
      </dl>

      {/* A live hold: the hours are the player's, but only for a few more
          minutes. The partner sees the same state without a pay link. */}
      {holding && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <span>
            {view === "player"
              ? "We're holding these hours until you pay."
              : "Held while the player pays."}
          </span>
          {view === "player" && booking.payment && (
            <Link
              href={`/dashboard/bookings/pay/${booking.payment.id}`}
              className="font-medium underline"
            >
              Complete payment
            </Link>
          )}
        </div>
      )}

      {booking.notes && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {booking.notes}
        </p>
      )}

      {/* Amber, not red — a move must never read as a cancellation. */}
      {booking.movedFrom && !cancelled && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <p className="font-medium">
            Moved by the venue
            {booking.movedFrom.count > 1
              ? ` (${booking.movedFrom.count} times)`
              : ""}
          </p>
          <p className="mt-0.5">
            Was {booking.movedFrom.courtName ?? "another court"} ·{" "}
            {formatManilaDateLong(booking.movedFrom.date)} ·{" "}
            {formatSlotRange(
              booking.movedFrom.startHour,
              booking.movedFrom.endHour
            )}
            {booking.movedFrom.totalPrice != null &&
            booking.movedFrom.totalPrice !== booking.totalPrice
              ? ` · was ${formatPHP(booking.movedFrom.totalPrice)}`
              : ""}
          </p>
          {booking.movedFrom.reason && (
            <p className="mt-1">{booking.movedFrom.reason}</p>
          )}
        </div>
      )}

      {cancelled && booking.cancelReason && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {booking.cancelledBy === "PLAYER"
            ? "You cancelled"
            : "Cancelled by the venue"}
          : {booking.cancelReason}
        </p>
      )}

      {/* Money can be given back whatever state the booking is in — including
          a cancellation whose refund leg failed at the gateway. */}
      {view === "partner" && paid && (
        <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
          <RefundBookingButton
            bookingId={booking.id}
            amountLabel={
              booking.totalPrice != null
                ? formatPHP(booking.totalPrice)
                : undefined
            }
          />
        </div>
      )}

      {cancellable && (booking.status === "CONFIRMED" || holding) && (
        <div className="mt-4 flex flex-wrap items-start justify-end gap-2 border-t border-gray-100 pt-3">
          {/* Only a confirmed booking can be moved. Money is in flight for a
              hold, and "moved" has no coherent meaning while it is. */}
          {reschedule && !holding && (
            <RescheduleBookingButton
              bookingId={booking.id}
              courts={reschedule.courts}
              operatingHours={reschedule.operatingHours}
              today={reschedule.today}
              nowHour={reschedule.nowHour}
              current={{
                courtId: booking.court.id,
                courtName: booking.court.name,
                date: booking.date,
                startHour: booking.startHour,
                endHour: booking.endHour,
                totalPrice: booking.totalPrice,
              }}
            />
          )}
          {/* Players don't cancel their own confirmed bookings — the venue
              holds the slot for them, so releasing it is the venue's call.
              They're told who to ask instead of being left with a dead end. */}
          {view === "partner" ? (
            <CancelBookingButton
              bookingId={booking.id}
              paid={paid}
              amountLabel={
                booking.totalPrice != null
                  ? formatPHP(booking.totalPrice)
                  : undefined
              }
            />
          ) : (
            <p className="text-xs text-gray-400">
              Need to change or cancel? Contact the venue.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
