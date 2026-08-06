import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CancelBookingButton } from "@/components/bookings/CancelBookingButton";
import { RefundBookingButton } from "@/components/bookings/RefundBookingButton";
import { RescheduleBookingButton } from "@/components/bookings/RescheduleBookingButton";
import type { BookingView } from "@/lib/bookings";
import { formatPHP } from "@/lib/currency";
import { formatManilaDate, formatManilaDateLong, formatSlotRange } from "@/lib/time";
import type { CourtScheduleRule } from "@/lib/slots";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONES,
  type OperatingHours,
} from "@/lib/constants";

type RescheduleOptions = {
  courts: {
    id: string;
    name: string;
    courtType: string;
    hourlyRate: number | null;
    scheduleRules: CourtScheduleRule[];
  }[];
  operatingHours: OperatingHours | null;
  today: string;
  nowHour: number;
};

export function PartnerBookingListRow({
  booking,
  cancellable,
  reschedule,
}: {
  booking: BookingView;
  cancellable: boolean;
  reschedule?: RescheduleOptions;
}) {
  const cancelled = booking.status === "CANCELLED";
  const holding = booking.status === "PENDING";
  const paid = booking.payment?.status === "SUCCEEDED";
  const refunded = booking.payment?.status === "REFUNDED";
  const refundableAmount = booking.payment
    ? booking.payment.amount -
      booking.payment.platformFee +
      booking.payment.processingFee
    : null;
  const playerName =
    booking.player.playerName ?? booking.player.name ?? "Player";
  const hasBookingActions =
    paid ||
    (cancellable &&
      (booking.status === "CONFIRMED" || booking.status === "PENDING"));

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm shadow-navy/5 ${
        holding
          ? "border-amber-200 border-l-4 border-l-amber-400"
          : "border-[#dfe7e2]"
      }`}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(10rem,1.15fr)_minmax(7rem,.7fr)_auto] xl:items-center">
        <div className="col-span-2 flex min-w-0 items-center gap-3 xl:col-span-1">
          <Avatar name={playerName} size={38} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy">
              {playerName}
            </p>
            <p className="truncate text-xs text-gray-500">
              {booking.player.phone ?? "No phone provided"}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 xl:sr-only">
            Venue
          </p>
          <p className="truncate text-sm font-medium text-gray-800">
            {booking.hub.name}
          </p>
          <p className="truncate text-xs text-gray-500">
            {booking.court.name}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 xl:sr-only">
            Schedule
          </p>
          <p
            className="truncate text-sm font-medium text-gray-800"
            title={formatManilaDateLong(booking.date)}
          >
            {formatManilaDate(booking.date)}
          </p>
          <p className="truncate text-xs text-gray-500">
            {formatSlotRange(booking.startHour, booking.endHour)} · {booking.hours}
            {booking.hours === 1 ? " hr" : " hrs"}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 xl:sr-only">
            Amount
          </p>
          <p className="text-sm font-semibold text-navy">
            {booking.totalPrice != null
              ? formatPHP(booking.totalPrice)
              : "Rate on request"}
          </p>
          {booking.payment && (paid || refunded) && (
            <p className="truncate text-xs text-gray-500">
              {refunded ? "Refunded" : "Subtotal"}:{" "}
              {formatPHP(
                refunded
                  ? (booking.payment.refundedAmount ?? refundableAmount ?? 0)
                  : booking.payment.amount
              )}
              {refunded && booking.payment.platformFee > 0
                ? ` · ${formatPHP(booking.payment.platformFee)} fee retained`
                : ""}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end">
          <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
        </div>
      </div>

      {holding && (
        <p className="mt-3 text-xs font-medium text-amber-700">
          Held while the player completes payment.
        </p>
      )}

      {booking.notes && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Note:</span>{" "}
          {booking.notes}
        </p>
      )}

      {booking.movedFrom && !cancelled && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <p className="font-semibold">
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
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {booking.cancelledBy === "PLAYER"
            ? "Cancelled by the player"
            : "Cancelled by the venue"}
          : {booking.cancelReason}
        </p>
      )}

      {hasBookingActions && (
        <div className="mt-3 flex flex-wrap items-start justify-end gap-1 border-t border-gray-100 pt-2">
          {paid && (
            <RefundBookingButton
              bookingId={booking.id}
              amountLabel={
                booking.payment
                  ? formatPHP(refundableAmount ?? booking.payment.amount)
                  : undefined
              }
            />
          )}
          {cancellable && booking.status === "CONFIRMED" && reschedule && (
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
          {cancellable &&
            (booking.status === "CONFIRMED" || booking.status === "PENDING") && (
              <CancelBookingButton
                bookingId={booking.id}
                paid={paid}
                amountLabel={
                  booking.payment
                    ? formatPHP(refundableAmount ?? booking.payment.amount)
                    : undefined
                }
              />
            )}
        </div>
      )}
    </article>
  );
}
