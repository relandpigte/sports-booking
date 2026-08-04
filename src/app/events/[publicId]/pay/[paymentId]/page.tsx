import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { EventPaymentPanel } from "@/components/events/EventPaymentPanel";
import { PageShell } from "@/components/PageShell";
import {
  getBookingPaymentScreen,
  pollBookingPayment,
} from "@/lib/booking-payments";
import { BOOKING_HOLD_MINUTES } from "@/lib/constants";
import { formatPHP } from "@/lib/currency";
import { getCurrentUser } from "@/lib/dal";
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
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect(`/events/${publicId}`);

  let screen = await getBookingPaymentScreen(paymentId, user.id);
  if (!screen || screen.payment.event?.publicId !== publicId) notFound();

  if (
    screen.payment.status === "PENDING" &&
    screen.payment.providerPaymentId
  ) {
    await pollBookingPayment(paymentId);
    screen = await getBookingPaymentScreen(paymentId, user.id);
    if (!screen || screen.payment.event?.publicId !== publicId) notFound();
  }

  const { payment, venueName } = screen;
  const event = payment.event!;
  const registrationConfirmed = event.registrationStatus === "CONFIRMED";
  const holdLive = payment.status === "PENDING" && payment.secondsLeft > 0;
  const activeCheckoutUrl =
    holdLive && payment.chargeInFlight ? payment.redirectUrl : null;

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
                      : holdLive
                        ? "Complete payment"
                        : "Registration hold expired"}
                </h1>
              </div>
              {holdLive && (
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
                <dt className="text-slate-500">Registration fee</dt>
                <dd className="font-semibold text-navy">{formatPHP(payment.venueAmount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Bunal service fee</dt>
                <dd className="font-semibold text-navy">{formatPHP(payment.platformFee)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                <dt className="font-black uppercase text-navy">Total</dt>
                <dd className="text-xl font-black text-navy">{formatPHP(payment.amount)}</dd>
              </div>
            </dl>

            <div className="mt-7">
              {payment.status === "SUCCEEDED" && registrationConfirmed ? (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                    Paid. Your name is now on the confirmed player list.
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
                    {payment.refundReason ?? "This registration was refunded."}
                  </p>
                  <Link href="/events" className="block rounded-2xl bg-primary px-4 py-3.5 text-center text-sm font-bold text-white hover:bg-primary-hover">
                    Browse events
                  </Link>
                </div>
              ) : holdLive ? (
                activeCheckoutUrl ? (
                  <div className="space-y-4">
                    <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Your checkout is still active. Continue where you left off.
                    </p>
                    <PayMongoCheckout checkoutUrl={activeCheckoutUrl} />
                  </div>
                ) : (
                  <EventPaymentPanel
                    paymentId={payment.id}
                    publicId={publicId}
                    amount={payment.amount}
                    venueName={venueName}
                  />
                )
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
