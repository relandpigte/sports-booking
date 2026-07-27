import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { CancelBookingButton } from "@/components/bookings/CancelBookingButton";
import type { BookingView } from "@/lib/bookings";
import { formatPHP } from "@/lib/currency";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { BOOKING_STATUS_LABELS, COURT_TYPE_LABELS } from "@/lib/constants";

// `player` shows the booker's details (partner view); `hub` shows the venue
// (player view). Cancel controls appear only for upcoming, confirmed bookings.
export function BookingCard({
  booking,
  view,
  cancellable,
}: {
  booking: BookingView;
  view: "player" | "partner";
  cancellable: boolean;
}) {
  const cancelled = booking.status === "CANCELLED";
  const tooLateToCancel = view === "player" && booking.playerCancelCutoffPassed;

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

        <span
          className={[
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            cancelled
              ? "bg-red-50 text-red-600"
              : "bg-primary-soft text-primary",
          ].join(" ")}
        >
          {BOOKING_STATUS_LABELS[booking.status]}
        </span>
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
      </dl>

      {booking.notes && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {booking.notes}
        </p>
      )}

      {cancelled && booking.cancelReason && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {booking.cancelledBy === "PLAYER"
            ? "You cancelled"
            : "Cancelled by the venue"}
          : {booking.cancelReason}
        </p>
      )}

      {cancellable && !cancelled && (
        <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
          {tooLateToCancel ? (
            <p className="text-xs text-gray-400">
              Too close to the start time to cancel online — contact the venue.
            </p>
          ) : (
            <CancelBookingButton bookingId={booking.id} variant={view} />
          )}
        </div>
      )}
    </div>
  );
}
