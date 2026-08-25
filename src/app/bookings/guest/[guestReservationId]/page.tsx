import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { ManualPaymentCheckout } from "@/components/bookings/ManualPaymentCheckout";
import { PayBookingPanel } from "@/components/bookings/PayBookingPanel";
import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { PaymentStatusPoller } from "@/components/bookings/PaymentStatusPoller";
import { CancelBookingHoldButton } from "@/components/bookings/CancelBookingHoldButton";
import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import {
  getGuestBookingPaymentScreen,
  pollBookingPayment,
  type BookingPaymentView,
} from "@/lib/booking-payments";
import { formatPHP } from "@/lib/currency";
import { prisma } from "@/lib/db";
import { getGuestReservationAccess } from "@/lib/guest-bookings";
import { formatManilaDate, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = {
  title: "Guest booking — Bunal.club",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function GuestBookingPage({
  params,
}: {
  params: Promise<{ guestReservationId: string }>;
}) {
  const { guestReservationId } = await params;
  const access = await getGuestReservationAccess(guestReservationId);
  if (!access) notFound();

  const reservation = await prisma.guestReservation.findUnique({
    where: { id: guestReservationId },
    select: {
      id: true,
      createdAt: true,
      payment: { select: { id: true } },
      bookings: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          date: true,
          startHour: true,
          endHour: true,
          hours: true,
          totalPrice: true,
          status: true,
          court: { select: { name: true } },
          hub: {
            select: {
              id: true,
              slug: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      },
    },
  });
  if (!reservation || reservation.bookings.length === 0) notFound();

  let screen = reservation.payment
    ? await getGuestBookingPaymentScreen(
        reservation.payment.id,
        guestReservationId
      )
    : null;
  if (
    screen?.payment.collectionMode === "AUTOMATIC" &&
    screen.payment.status === "PENDING" &&
    screen.payment.providerPaymentId
  ) {
    await pollBookingPayment(screen.payment.id);
    screen = await getGuestBookingPaymentScreen(
      screen.payment.id,
      guestReservationId
    );
  }

  const firstBooking = reservation.bookings[0];
  const venue = firstBooking.hub;
  const venueHref = `/hubs/${venue.slug ?? venue.id}`;
  const reference = (screen?.payment.id ?? reservation.id).slice(-8).toUpperCase();

  if (
    screen?.payment.collectionMode === "MANUAL" &&
    screen.payment.status === "PENDING" &&
    !screen.payment.manualSubmittedAt &&
    screen.payment.secondsLeft > 0
  ) {
    return (
      <PageShell alwaysPublic maxWidth="max-w-6xl" backgroundClass="bg-[#f7faf8]">
        <div className="py-8 sm:py-10">
          <PrivateHeader venueName={venue.name} reference={reference} />
          <div className="mt-6">
            <ManualPaymentCheckout
              paymentId={screen.payment.id}
              amountLabel={formatPHP(screen.payment.payableAmount)}
              expiresAt={screen.payment.expiresAt.toISOString()}
              initialSeconds={screen.payment.secondsLeft}
              methods={screen.manualMethods}
              summary={{
                venueName: screen.venueName,
                venueHref,
                venuePhone: screen.venuePhone,
                venueEmail: screen.venueEmail,
                guestContact: {
                  name: access.name,
                  phone: access.phone,
                  email: access.email,
                },
                lines: screen.payment.lines.map((line) => ({
                  id: line.bookingId,
                  label: line.courtName,
                  detail: `${formatManilaDate(line.date)} · ${formatSlotRange(line.startHour, line.endHour)}`,
                  quantity: `${line.hours} ${line.hours === 1 ? "hour" : "hours"}`,
                })),
                venueAmountLabel: formatPHP(screen.payment.venueAmount),
                serviceFeeLabel:
                  screen.payment.platformFee > 0
                    ? formatPHP(screen.payment.platformFee)
                    : null,
                totalLabel: formatPHP(screen.payment.payableAmount),
              }}
            />
          </div>
        </div>
      </PageShell>
    );
  }

  const payment = screen?.payment;
  const manualReview = Boolean(
    payment?.collectionMode === "MANUAL" &&
      payment.status === "PENDING" &&
      payment.manualSubmittedAt
  );
  const declined = Boolean(
    payment?.status === "FAILED" &&
      payment.failureCode === "manual_payment_declined"
  );
  const confirmed = payment
    ? payment.status === "SUCCEEDED"
    : reservation.bookings.every((booking) => booking.status === "CONFIRMED");
  const holdLive = Boolean(
    payment?.status === "PENDING" && payment.secondsLeft > 0
  );

  return (
    <PageShell alwaysPublic maxWidth="max-w-5xl" backgroundClass="bg-[#f7faf8]">
      <div className="py-8 sm:py-10">
        <PrivateHeader venueName={venue.name} reference={reference} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <StatusBadge
                  confirmed={confirmed}
                  declined={declined}
                  review={manualReview}
                />
                <h1 className="mt-3 text-2xl font-black text-navy">
                  {confirmed
                    ? "Booking confirmed"
                    : declined
                      ? "Booking declined"
                      : manualReview
                        ? "Venue review in progress"
                        : holdLive
                          ? "Complete your payment"
                          : "Reservation expired"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {confirmed
                    ? `${venue.name} is holding the selected court time for you.`
                    : declined
                      ? "The venue reviewed the payment and did not confirm this booking. The court hours were released."
                      : manualReview
                        ? `Your receipt was received. ${venue.name} is reviewing it, and your hours remain protected until a decision is made.`
                        : holdLive
                          ? "Finish payment before the hold expires. Confirmation is emailed automatically after payment succeeds."
                          : "The payment window ended before the booking was confirmed."}
                </p>
              </div>
              {holdLive && payment?.collectionMode === "AUTOMATIC" && (
                <HoldCountdown
                  expiresAt={payment.expiresAt.toISOString()}
                  initialSeconds={payment.secondsLeft}
                />
              )}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Court reservation
              </h2>
              <div className="mt-3 space-y-3">
                {reservation.bookings.map((booking) => (
                  <div key={booking.id} className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-navy">{booking.court.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatManilaDate(booking.date)} · {formatSlotRange(booking.startHour, booking.endHour)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-navy">
                      {booking.hours} {booking.hours === 1 ? "hour" : "hours"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {declined && payment?.failureMessage && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">Venue reason</p>
                <p className="mt-1 text-sm leading-6 text-red-700">{payment.failureMessage}</p>
              </div>
            )}

            {!confirmed && !declined && !manualReview && holdLive && payment && (
              <div className="mt-6">
                {payment.chargeInFlight && (payment.qrImageUrl || payment.redirectUrl) ? (
                  <div className="space-y-3">
                    <PayMongoCheckout
                      qrImageUrl={payment.qrImageUrl}
                      checkoutUrl={payment.redirectUrl}
                      expiresAt={payment.expiresAt.toISOString()}
                      initialSeconds={payment.secondsLeft}
                    />
                    <PaymentStatusPoller
                      paymentId={payment.id}
                      initialStatus={payment.status}
                      initialChargeInFlight={payment.chargeInFlight}
                      statusBasePath={`/api/guest-bookings/${guestReservationId}/payments`}
                    />
                    <CancelBookingHoldButton paymentId={payment.id} />
                  </div>
                ) : (
                  <PayBookingPanel
                    paymentId={payment.id}
                    amount={payment.payableAmount}
                    venueName={venue.name}
                    expiresAt={payment.expiresAt.toISOString()}
                    initialSeconds={payment.secondsLeft}
                  />
                )}
              </div>
            )}

            {(declined || (!confirmed && !holdLive && !manualReview)) && (
              <Link href="/hubs" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white">
                Find another court
              </Link>
            )}
          </section>

          <aside className="space-y-4">
            <PriceCard payment={payment} bookings={reservation.bookings} />
            <GuestContactCard access={access} compact />
            <div className="rounded-2xl border border-primary/15 bg-primary-soft p-4 text-xs leading-5 text-navy/60">
              This is a private booking page. Do not forward the access link. Bunal.club will email you after the venue approves or declines a manual payment.
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

function PrivateHeader({ venueName, reference }: { venueName: string; reference: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Private guest booking</p>
        <p className="mt-1 text-sm font-bold text-navy">{venueName}</p>
      </div>
      <p className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">Reference {reference}</p>
    </div>
  );
}

function StatusBadge({ confirmed, declined, review }: { confirmed: boolean; declined: boolean; review: boolean }) {
  const label = confirmed ? "Confirmed" : declined ? "Declined" : review ? "Under review" : "Payment pending";
  const style = confirmed ? "bg-green-50 text-green-700" : declined ? "bg-red-50 text-red-700" : review ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${style}`}>{label}</span>;
}

function GuestContactCard({ access, compact = false }: { access: { name: string; phone: string; email: string }; compact?: boolean }) {
  return (
    <section className={`${compact ? "rounded-2xl" : "mx-auto mt-5 max-w-2xl rounded-2xl"} border border-slate-200 bg-white p-4`}>
      <h2 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Guest details</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="text-xs text-slate-400">Name</dt><dd className="font-bold text-navy">{access.name}</dd></div>
        <div><dt className="text-xs text-slate-400">Phone</dt><dd className="font-bold text-navy">{access.phone}</dd></div>
        <div><dt className="text-xs text-slate-400">Email updates</dt><dd className="break-all font-bold text-navy">{access.email}</dd></div>
      </dl>
    </section>
  );
}

function PriceCard({ payment, bookings }: { payment: BookingPaymentView | undefined; bookings: Array<{ totalPrice: unknown }> }) {
  const courtTotal = payment?.venueAmount ?? bookings.reduce((sum, booking) => sum + Number(booking.totalPrice ?? 0), 0);
  const total = payment?.payableAmount ?? courtTotal;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Payment summary</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Court time</dt><dd className="font-bold text-navy">{formatPHP(courtTotal)}</dd></div>
        {payment && payment.platformFee > 0 && <div className="flex justify-between"><dt className="text-slate-500">Service fee</dt><dd className="font-bold text-navy">{formatPHP(payment.platformFee)}</dd></div>}
        {payment && payment.processingFee > 0 && <div className="flex justify-between"><dt className="text-slate-500">Processing fee</dt><dd className="font-bold text-navy">{formatPHP(payment.processingFee)}</dd></div>}
        <div className="flex justify-between border-t border-slate-100 pt-3"><dt className="font-black text-navy">Total</dt><dd className="text-lg font-black text-navy">{formatPHP(total)}</dd></div>
      </dl>
    </section>
  );
}
