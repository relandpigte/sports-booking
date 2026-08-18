import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/dal";
import {
  getBookingPaymentScreen,
  pollBookingPayment,
} from "@/lib/booking-payments";
import { HoldCountdown } from "@/components/bookings/HoldCountdown";
import { PayBookingPanel } from "@/components/bookings/PayBookingPanel";
import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { PaymentStatusPoller } from "@/components/bookings/PaymentStatusPoller";
import { ManualPaymentCheckout } from "@/components/bookings/ManualPaymentCheckout";
import { CancelBookingHoldButton } from "@/components/bookings/CancelBookingHoldButton";
import { formatPHP } from "@/lib/currency";
import { formatManilaDate, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = {
  title: "Complete payment — Bunal.club",
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
  if (
    screen.payment.collectionMode === "AUTOMATIC" &&
    screen.payment.status === "PENDING" &&
    screen.payment.providerPaymentId
  ) {
    await pollBookingPayment(paymentId);
    screen = await getBookingPaymentScreen(paymentId, user.id);
    if (!screen) notFound();
  }

  const {
    payment,
    venueName,
    venueSlug,
    venuePhone,
    venueEmail,
    manualMethods,
  } = screen;
  const holdLive = payment.status === "PENDING" && payment.secondsLeft > 0;
  const playerCancelled =
    payment.status === "FAILED" &&
    (payment.failureCode === "player_cancelled" ||
      payment.failureCode === "player_released");
  const refundedAmount =
    payment.refundedAmount ?? payment.venueAmount + payment.processingFee;
  // Existing hosted sessions and current direct QR intents both remain bound
  // to the same claimed payment row while the hold is live.
  const activeCheckoutUrl =
    holdLive && payment.chargeInFlight ? payment.redirectUrl : null;
  const activeQrImageUrl =
    holdLive && payment.chargeInFlight ? payment.qrImageUrl : null;

  if (
    payment.collectionMode === "MANUAL" &&
    payment.manualSubmittedAt == null &&
    payment.event == null &&
    holdLive
  ) {
    return (
      <ManualPaymentCheckout
        paymentId={payment.id}
        amountLabel={formatPHP(payment.payableAmount)}
        expiresAt={payment.expiresAt.toISOString()}
        initialSeconds={payment.secondsLeft}
        methods={manualMethods}
        summary={{
          venueName,
          venueHref: `/hubs/${venueSlug ?? payment.hubId}`,
          venuePhone,
          venueEmail,
          lines: payment.lines.map((line) => ({
            id: line.bookingId,
            label: line.courtName,
            detail: `${formatManilaDate(line.date)} · ${formatSlotRange(
              line.startHour,
              line.endHour
            )}`,
            quantity: `${line.hours} ${line.hours === 1 ? "hour" : "hours"}`,
          })),
          venueAmountLabel: formatPHP(payment.venueAmount),
          serviceFeeLabel:
            payment.platformFee > 0 ? formatPHP(payment.platformFee) : null,
          totalLabel: formatPHP(payment.payableAmount),
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {payment.status === "SUCCEEDED"
                ? "Booking confirmed"
                : payment.status === "REFUNDED"
                  ? "Refunded"
                  : payment.manualSubmittedAt
                    ? "Pending booking"
                    : playerCancelled
                      ? "Reservation cancelled"
                      : holdLive
                        ? "Complete your booking"
                        : "Hold expired"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{venueName}</p>
          </div>
          {holdLive && payment.collectionMode === "AUTOMATIC" && (
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
            <dt className="text-gray-500">Court time</dt>
            <dd className="text-gray-900">{formatPHP(payment.venueAmount)}</dd>
          </div>
          {payment.platformFee > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">
                Service fee (non-refundable)
              </dt>
              <dd className="text-gray-900">{formatPHP(payment.platformFee)}</dd>
            </div>
          )}
          {payment.processingFee > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">PayMongo processing fee</dt>
              <dd className="text-gray-900">
                {formatPHP(payment.processingFee)}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            <dt className="font-medium text-gray-900">Total to pay</dt>
            <dd className="text-base font-semibold text-gray-900">
              {formatPHP(payment.payableAmount)}
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
                {payment.refundReason ?? "This booking was refunded."}{" "}
                {formatPHP(refundedAmount)} was returned
                {payment.platformFee > 0
                  ? `; the ${formatPHP(payment.platformFee)} service fee was retained.`
                  : ". No service fee applied to this manual payment."}
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
            (payment.collectionMode === "MANUAL" && payment.manualSubmittedAt ? (
              <div className="flex flex-col gap-3">
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Payment proof submitted. Your hours are protected while {venueName}
                  reviews the receipt. This booking remains pending until approval.
                </p>
                {payment.failureMessage && (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                    {payment.failureMessage}
                  </p>
                )}
                <Link href="/dashboard/bookings" className="rounded-xl bg-navy px-4 py-3 text-center text-sm font-bold text-white">
                  View my bookings
                </Link>
              </div>
            ) : holdLive ? (
              activeQrImageUrl || activeCheckoutUrl ? (
                <div className="flex flex-col gap-3">
                  {activeCheckoutUrl && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
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
                  />
                  {payment.providerPaymentId?.startsWith("pi_") && (
                    <CancelBookingHoldButton paymentId={payment.id} />
                  )}
                </div>
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
                    amount={payment.payableAmount}
                    venueName={venueName}
                    expiresAt={payment.expiresAt.toISOString()}
                    initialSeconds={payment.secondsLeft}
                  />
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <p
                  className={`rounded-lg px-3 py-2.5 text-sm ${
                    playerCancelled
                      ? "bg-slate-100 text-slate-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {playerCancelled
                    ? "You cancelled this reservation. The court slots are available for other players again."
                    : "This hold ran out before the payment completed, so the hours went back on sale. Nothing was charged."}
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
