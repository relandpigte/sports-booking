import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/dal";
import {
  getBookingPaymentScreen,
  pollBookingPayment,
} from "@/lib/booking-payments";
import { BookingCheckoutApproval } from "@/components/bookings/BookingCheckoutApproval";
import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { PayBookingPanel } from "@/components/bookings/PayBookingPanel";
import { formatPHP } from "@/lib/currency";
import { formatManilaDate, formatSlotRange } from "@/lib/time";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Complete payment — Sports 360",
};

// One page, four states: pay, approve, paid, and the hold that ran out.
//
// It is also the return leg. A wallet or 3DS approval sends the browser back
// here, which may beat the webhook — so the first thing it does is ask the
// gateway where the charge actually got to.
export default async function PayBookingPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  // Next 16: params is a Promise.
  const { paymentId } = await params;

  const user = await getCurrentUser();
  if (user?.role !== "PLAYER") redirect("/dashboard");

  let screen = await getBookingPaymentScreen(paymentId, user.id);
  if (!screen) notFound();

  // The return leg. Only worth asking once the gateway has given us something
  // to ask about.
  if (screen.payment.status === "PENDING" && screen.payment.providerPaymentId) {
    await pollBookingPayment(paymentId);
    screen = await getBookingPaymentScreen(paymentId, user.id);
    if (!screen) notFound();
  }

  const { payment, venueName } = screen;
  const holdLive = payment.status === "PENDING" && payment.secondsLeft > 0;
  // A wallet charge that's waiting on the payer. With a real gateway the
  // approval happens on the gateway's own page; the stub renders it here.
  const awaitingApproval =
    holdLive && payment.chargeInFlight && payment.redirectUrl != null;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {payment.status === "SUCCEEDED"
                ? "Booking confirmed"
                : payment.status === "REFUNDED"
                  ? "Refunded"
                  : holdLive
                    ? "Complete your booking"
                    : "Hold expired"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{venueName}</p>
          </div>
          {holdLive && (
            <HoldCountdown
              expiresAt={payment.expiresAt.toISOString()}
              initialSeconds={payment.secondsLeft}
            />
          )}
        </div>

        <dl className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4 text-sm">
          {payment.lines.map((line) => (
            <div
              key={line.bookingId}
              className="flex items-start justify-between gap-3"
            >
              <dt className="text-gray-500">
                {line.courtName}
                <span className="block text-xs text-gray-400">
                  {formatManilaDate(line.date)} ·{" "}
                  {formatSlotRange(line.startHour, line.endHour)}
                </span>
              </dt>
              <dd className="shrink-0 text-gray-900">
                {line.hours} {line.hours === 1 ? "hour" : "hours"}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-3">
            <dt className="text-gray-500">Total</dt>
            <dd className="text-base font-semibold text-gray-900">
              {formatPHP(payment.amount)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          {payment.status === "SUCCEEDED" && (
            <div className="flex flex-col gap-3">
              <p className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700">
                Paid. {venueName} is holding the court for you.
              </p>
              <Link
                href="/dashboard/bookings"
                className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                View my bookings
              </Link>
            </div>
          )}

          {payment.status === "REFUNDED" && (
            <div className="flex flex-col gap-3">
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                {payment.refundReason ??
                  "This payment was refunded in full."}
              </p>
              <Link
                href="/hubs"
                className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Find another court
              </Link>
            </div>
          )}

          {payment.status !== "SUCCEEDED" &&
            payment.status !== "REFUNDED" &&
            (holdLive ? (
              awaitingApproval ? (
                <BookingCheckoutApproval
                  paymentId={payment.id}
                  methodLabel={
                    PAYMENT_METHOD_LABELS[payment.method] ?? payment.method
                  }
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {payment.failureMessage && (
                    <p
                      role="alert"
                      className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
                    >
                      {payment.failureMessage} Your court is still held — try
                      again.
                    </p>
                  )}
                  <PayBookingPanel
                    paymentId={payment.id}
                    amount={payment.amount}
                    venueName={venueName}
                  />
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  This hold ran out before the payment completed, so the hours
                  went back on sale. Nothing was charged.
                </p>
                <Link
                  href="/hubs"
                  className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  Book again
                </Link>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
