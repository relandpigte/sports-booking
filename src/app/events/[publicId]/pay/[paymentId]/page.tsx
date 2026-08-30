import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CancelBookingHoldButton } from "@/components/bookings/CancelBookingHoldButton";
import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { PaymentStatusPoller } from "@/components/bookings/PaymentStatusPoller";
import { EventPaymentPanel } from "@/components/events/EventPaymentPanel";
import { ManualPaymentCheckout } from "@/components/bookings/ManualPaymentCheckout";
import { PageShell } from "@/components/PageShell";
import {
  getBookingPaymentScreen,
  getGuestBookingPaymentScreen,
  pollBookingPayment,
} from "@/lib/booking-payments";
import { BOOKING_HOLD_MINUTES } from "@/lib/constants";
import { formatPHP } from "@/lib/currency";
import { getViewer } from "@/lib/dal";
import {
  getCurrentGuestReservationId,
  getGuestReservationAccess,
} from "@/lib/guest-bookings";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = {
  title: "Complete event registration — Bunal.club",
};

export default async function PayEventRegistrationPage({
  params,
}: {
  params: Promise<{ publicId: string; paymentId: string }>;
}) {
  const { publicId, paymentId } = await params;
  const viewer = await getViewer();
  if (viewer && viewer.role !== "PLAYER") redirect(`/events/${publicId}`);
  const guestReservationId = viewer
    ? null
    : await getCurrentGuestReservationId();
  const guestAccess = guestReservationId
    ? await getGuestReservationAccess(guestReservationId)
    : null;
  if (!viewer && !guestAccess) redirect(`/events/${publicId}`);

  let screen = viewer
    ? await getBookingPaymentScreen(paymentId, viewer.id)
    : await getGuestBookingPaymentScreen(paymentId, guestReservationId!);
  if (!screen || screen.payment.event?.publicId !== publicId) notFound();

  if (
    screen.payment.collectionMode === "AUTOMATIC" &&
    screen.payment.status === "PENDING" &&
    screen.payment.providerPaymentId
  ) {
    await pollBookingPayment(paymentId);
    screen = viewer
      ? await getBookingPaymentScreen(paymentId, viewer.id)
      : await getGuestBookingPaymentScreen(paymentId, guestReservationId!);
    if (!screen || screen.payment.event?.publicId !== publicId) notFound();
  }

  const { payment, venueName, manualMethods } = screen;
  const event = payment.event!;
  const registrationConfirmed = event.registrationStatus === "CONFIRMED";
  const holdLive = payment.status === "PENDING" && payment.secondsLeft > 0;
  const playerCancelled =
    payment.failureCode === "player_cancelled" ||
    payment.failureCode === "player_released";
  const refundedAmount =
    payment.refundedAmount ?? payment.venueAmount + payment.processingFee;
  const activeCheckoutUrl =
    holdLive && payment.chargeInFlight ? payment.redirectUrl : null;
  const activeQrImageUrl =
    holdLive && payment.chargeInFlight ? payment.qrImageUrl : null;

  return (
    <PageShell maxWidth="max-w-xl">
      <div className="py-10 sm:py-14">
        <Link href={`/events/${publicId}`} className="text-sm font-bold text-slate-500 hover:text-navy">
          ← Back to event
        </Link>
        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-navy px-6 py-7 text-white sm:px-8">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                  Event registration
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight">
                  {payment.status === "SUCCEEDED"
                    ? registrationConfirmed
                      ? "Registration confirmed"
                      : "Payment received"
                    : payment.status === "REFUNDED"
                      ? "Registration refunded"
                      : payment.manualSubmittedAt
                        ? "Pending registration"
                        : holdLive
                          ? "Complete payment"
                          : playerCancelled
                            ? "Registration cancelled"
                            : "Registration hold expired"}
                </h1>
              </div>
              {holdLive && payment.collectionMode === "AUTOMATIC" && (
                <HoldCountdown
                  expiresAt={payment.expiresAt.toISOString()}
                  initialSeconds={payment.secondsLeft}
                  tone="dark"
                />
              )}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-black text-navy">{event.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatManilaDateLong(event.date)} · {formatSlotRange(event.startHour, event.endHour)}
            </p>
            <p className="mt-1 text-sm text-slate-500">{venueName}</p>

            <dl className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">
                  {event.addOn ? "Additional guest spots" : "Registration fee"}
                  {event.spotCount > 1 && ` · ${event.spotCount} spots`}
                </dt>
                <dd className="font-semibold text-navy">{formatPHP(payment.venueAmount)}</dd>
              </div>
              {payment.platformFee > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">
                    Bunal service fee (non-refundable)
                  </dt>
                  <dd className="font-semibold text-navy">{formatPHP(payment.platformFee)}</dd>
                </div>
              )}
              {payment.processingFee > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">PayMongo processing fee</dt>
                  <dd className="font-semibold text-navy">
                    {formatPHP(payment.processingFee)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                <dt className="font-black uppercase text-navy">Total to pay</dt>
                <dd className="text-xl font-black text-navy">{formatPHP(payment.payableAmount)}</dd>
              </div>
            </dl>

            {event.guestNames.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Guest names
                </p>
                <ul className="mt-2 space-y-1 text-sm font-semibold text-navy">
                  {event.guestNames.map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-7">
              {holdLive && !payment.manualSubmittedAt && (
                <div className="mb-4">
                  <CancelBookingHoldButton
                    paymentId={payment.id}
                    label={
                      event.addOn
                        ? "Cancel guest spots"
                        : event.spotCount > 1
                          ? "Cancel registration and free spots"
                          : "Cancel spot"
                    }
                    confirmation="Cancel this event registration? Its reserved spots will immediately become available to other players."
                  />
                </div>
              )}

              {payment.status === "SUCCEEDED" && registrationConfirmed ? (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                    {event.addOn
                      ? "Paid. Your guest spots are confirmed."
                      : "Paid. Your group is now on the confirmed player list."}
                  </p>
                  <Link href={`/events/${publicId}`} className="block rounded-2xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white hover:bg-primary-hover">
                    View event
                  </Link>
                </div>
              ) : payment.status === "SUCCEEDED" ? (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Your payment was received, but the registration still needs
                    to be restored. Return to the event and choose Restore paid
                    registration. You will not be charged again.
                  </p>
                  <Link href={`/events/${publicId}`} className="block rounded-2xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white hover:bg-primary-hover">
                    Restore registration
                  </Link>
                </div>
              ) : payment.status === "REFUNDED" ? (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {payment.refundReason ?? "This registration was refunded."}{" "}
                    {formatPHP(refundedAmount)} was returned
                    {payment.platformFee > 0
                      ? `; the ${formatPHP(payment.platformFee)} service fee was retained.`
                      : ". No service fee applied to this manual payment."}
                  </p>
                  <Link href="/events" className="block rounded-2xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white hover:bg-primary-hover">
                    Browse events
                  </Link>
                </div>
              ) : payment.collectionMode === "MANUAL" && payment.manualSubmittedAt ? (
                <div className="space-y-4">
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Payment proof submitted. Your event spots are protected while
                    the organizer reviews the receipt. The registration remains pending.
                  </p>
                  <Link href={`/events/${publicId}`} className="block rounded-2xl bg-navy px-4 py-3.5 text-center text-sm font-bold text-white">
                    View event
                  </Link>
                </div>
              ) : payment.collectionMode === "MANUAL" && holdLive ? (
                <ManualPaymentCheckout
                  paymentId={payment.id}
                  amountLabel={formatPHP(payment.payableAmount)}
                  expiresAt={payment.expiresAt.toISOString()}
                  initialSeconds={payment.secondsLeft}
                  methods={manualMethods}
                />
              ) : holdLive ? (
                activeQrImageUrl || activeCheckoutUrl ? (
                  <div className="space-y-4">
                    {activeCheckoutUrl && (
                      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        This hold started before direct QR Ph was enabled. Finish
                        it through the original PayMongo checkout.
                      </p>
                    )}
                    <PayMongoCheckout
                      qrImageUrl={activeQrImageUrl}
                      checkoutUrl={activeCheckoutUrl}
                      expiresAt={payment.expiresAt.toISOString()}
                      initialSeconds={payment.secondsLeft}
                    />
                    <PaymentStatusPoller
                      paymentId={payment.id}
                      initialStatus={payment.status}
                      initialChargeInFlight={payment.chargeInFlight}
                      statusBasePath={
                        guestReservationId
                          ? `/api/guest-bookings/${guestReservationId}/payments`
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <EventPaymentPanel
                    paymentId={payment.id}
                    publicId={publicId}
                    amount={payment.payableAmount}
                    venueName={venueName}
                    expiresAt={payment.expiresAt.toISOString()}
                    initialSeconds={payment.secondsLeft}
                    statusBasePath={
                      guestReservationId
                        ? `/api/guest-bookings/${guestReservationId}/payments`
                        : undefined
                    }
                  />
                )
              ) : playerCancelled ? (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                    You cancelled this registration. The reserved event spots
                    are available to other players again.
                  </p>
                  <Link href={`/events/${publicId}`} className="block rounded-2xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white hover:bg-primary-hover">
                    Return to event
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                    The {BOOKING_HOLD_MINUTES}-minute hold expired. Nothing was
                    charged; register again if a spot remains.
                  </p>
                  <Link href={`/events/${publicId}`} className="block rounded-2xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white hover:bg-primary-hover">
                    Return to event
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
