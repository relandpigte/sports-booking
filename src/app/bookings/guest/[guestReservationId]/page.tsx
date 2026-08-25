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
  const statusKind: BookingStatusKind = confirmed
    ? "confirmed"
    : declined
      ? "declined"
      : manualReview
        ? "review"
        : holdLive &&
            payment?.chargeInFlight &&
            (payment.qrImageUrl || payment.redirectUrl)
          ? "processing"
          : holdLive
            ? "payment"
            : "expired";

  return (
    <PageShell alwaysPublic maxWidth="max-w-4xl" backgroundClass="bg-[#f7faf8]">
      <div className="mx-auto w-full max-w-3xl py-8 sm:py-10 lg:py-12">
        <BookingStatusHeader
          venueName={venue.name}
          reference={reference}
          statusKind={statusKind}
        />

        <BookingStatusHero
          statusKind={statusKind}
          venueName={venue.name}
          guestEmail={access.email}
          failureMessage={payment?.failureMessage}
        />

        {!confirmed && !declined && !manualReview && holdLive && payment && (
          <PaymentActionCard
            payment={payment}
            guestReservationId={guestReservationId}
            venueName={venue.name}
          />
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <BookingDetailsCard
            venueName={venue.name}
            bookings={reservation.bookings}
          />
          <PriceBreakdownCard
            payment={payment}
            bookings={reservation.bookings}
          />
          <GuestContactCard access={access} />
          <VenueContactCard
            venueName={venue.name}
            venueHref={venueHref}
            phone={venue.phone}
            email={venue.email}
          />
        </div>

        {declined && payment?.failureMessage && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">
              Venue reason
            </p>
            <p className="mt-1 text-sm leading-6 text-red-700">
              {payment.failureMessage}
            </p>
          </div>
        )}

        {(declined || statusKind === "expired") && (
          <div className="mt-5">
            <Link
              href="/hubs"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-black text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover sm:w-auto"
            >
              Find another court
              <span aria-hidden="true" className="ml-2">→</span>
            </Link>
          </div>
        )}

        <PrivateBookingNotice />

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-400 sm:flex-row sm:items-center">
          <p>
            No account is required. Status updates are sent to the guest email
            on this booking.
          </p>
          <Link
            href={venueHref}
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-navy transition-colors hover:text-primary"
          >
            Browse {venue.name}
            <span aria-hidden="true" className="ml-2">→</span>
          </Link>
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

type BookingStatusKind =
  | "confirmed"
  | "declined"
  | "review"
  | "processing"
  | "payment"
  | "expired";

const statusContent: Record<
  BookingStatusKind,
  {
    badge: string;
    eyebrow: string;
    title: string;
    badgeClass: string;
    heroClass: string;
    iconClass: string;
  }
> = {
  confirmed: {
    badge: "Confirmed",
    eyebrow: "Booking confirmed",
    title: "Your court is confirmed.",
    badgeClass: "border-green-200 bg-green-50 text-green-700",
    heroClass: "border-green-200 bg-green-50",
    iconClass: "bg-primary text-white",
  },
  declined: {
    badge: "Declined",
    eyebrow: "Payment proof declined",
    title: "The booking was not confirmed.",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    heroClass: "border-red-200 bg-red-50",
    iconClass: "bg-red-600 text-white",
  },
  review: {
    badge: "Pending venue review",
    eyebrow: "Payment proof submitted",
    title: "Your reserved hours remain protected.",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
    heroClass: "border-amber-200 bg-amber-50",
    iconClass: "bg-primary text-white",
  },
  processing: {
    badge: "QR payment in progress",
    eyebrow: "PayMongo verification",
    title: "Waiting for your payment to complete.",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    heroClass: "border-sky-200 bg-sky-50",
    iconClass: "bg-ocean text-white",
  },
  payment: {
    badge: "Payment pending",
    eyebrow: "Reservation held",
    title: "Complete payment before the hold expires.",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    heroClass: "border-sky-200 bg-sky-50",
    iconClass: "bg-ocean text-white",
  },
  expired: {
    badge: "Expired",
    eyebrow: "Reservation expired",
    title: "These court hours are no longer held.",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
    heroClass: "border-slate-200 bg-slate-100",
    iconClass: "bg-slate-500 text-white",
  },
};

function BookingStatusHeader({
  venueName,
  reference,
  statusKind,
}: {
  venueName: string;
  reference: string;
  statusKind: BookingStatusKind;
}) {
  const content = statusContent[statusKind];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
          Guest booking
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-navy sm:text-4xl">
          Booking status
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {venueName} · Reference{" "}
          <span className="font-mono font-bold text-navy">{reference}</span>
        </p>
      </div>
      <span
        className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-full border px-4 text-sm font-black ${content.badgeClass}`}
      >
        <span className="size-2 rounded-full bg-current" aria-hidden="true" />
        {content.badge}
      </span>
    </div>
  );
}

function BookingStatusHero({
  statusKind,
  venueName,
  guestEmail,
  failureMessage,
}: {
  statusKind: BookingStatusKind;
  venueName: string;
  guestEmail: string;
  failureMessage?: string | null;
}) {
  const content = statusContent[statusKind];
  const description =
    statusKind === "confirmed"
      ? `${venueName} is holding the reserved court hours for you. A confirmation was sent to ${guestEmail}.`
      : statusKind === "declined"
        ? `The venue reviewed the payment and did not confirm this booking. The held court hours were released.${failureMessage ? " See the venue reason below." : ""}`
        : statusKind === "review"
          ? `${venueName} is reviewing your receipt. Your booking stays pending until the venue approves or declines the proof. We’ll email ${guestEmail} as soon as a decision is made.`
          : statusKind === "processing"
            ? "Keep this page open while PayMongo verifies the QR Ph payment. Confirmation happens automatically."
            : statusKind === "payment"
              ? "Your selected hours are temporarily protected. Finish the secure QR Ph payment below to confirm the booking."
              : "The payment window ended before the booking was confirmed. You can search again for currently available court hours.";

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(16,36,58,0.05)]">
      <div className={`border-b px-5 py-6 sm:px-7 ${content.heroClass}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-full ${content.iconClass}`}
          >
            <StatusIcon statusKind={statusKind} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-current opacity-70">
              {content.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-navy sm:text-2xl">
              {content.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
        </div>
      </div>
      <ProgressSteps statusKind={statusKind} />
    </section>
  );
}

function ProgressSteps({ statusKind }: { statusKind: BookingStatusKind }) {
  const steps =
    statusKind === "confirmed"
      ? [
          ["Payment complete", "Payment received", "complete"],
          ["Venue confirmed", "Court reserved", "complete"],
          ["Email sent", "Confirmation delivered", "complete"],
        ]
      : statusKind === "declined"
        ? [
            ["Proof submitted", "Receipt received", "complete"],
            ["Venue reviewed", "Proof declined", "error"],
            ["Slots released", "Available to others", "error"],
          ]
        : statusKind === "review"
          ? [
              ["Proof submitted", "Receipt received", "complete"],
              ["Venue review", "In progress", "current"],
              ["Email decision", "Approval or decline", "pending"],
            ]
          : statusKind === "processing"
            ? [
                ["QR created", "Ready to scan", "complete"],
                ["Bank verification", "In progress", "current"],
                ["Confirmation", "Sent automatically", "pending"],
              ]
            : statusKind === "payment"
              ? [
                  ["Hours selected", "Temporarily held", "complete"],
                  ["Secure payment", "Required now", "current"],
                  ["Confirmation", "Sent automatically", "pending"],
                ]
              : [
                  ["Hours selected", "Hold created", "complete"],
                  ["Payment window", "Not completed", "error"],
                  ["Slots released", "Available to others", "error"],
                ];

  return (
    <ol
      aria-label="Booking progress"
      className="grid grid-cols-1 gap-4 px-5 py-6 sm:grid-cols-3 sm:gap-0 sm:px-7"
    >
      {steps.map(([label, detail, tone], index) => (
        <li
          key={label}
          className={`relative flex items-center gap-3 sm:block ${
            index === 0 ? "sm:pr-4" : index === 2 ? "sm:pl-4" : "sm:px-4"
          }`}
        >
          {index > 0 && (
            <span
              aria-hidden="true"
              className="absolute -left-1/2 right-1/2 top-[17px] hidden h-0.5 bg-slate-200 sm:block"
            />
          )}
          <span
            className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black ${
              tone === "complete"
                ? "border-primary bg-primary text-white"
                : tone === "current"
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : tone === "error"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {tone === "complete" ? "✓" : tone === "error" ? "!" : index + 1}
          </span>
          <div className="sm:mt-3">
            <p className="text-sm font-black text-navy">{label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PaymentActionCard({
  payment,
  guestReservationId,
  venueName,
}: {
  payment: BookingPaymentView;
  guestReservationId: string;
  venueName: string;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(16,36,58,0.04)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ocean">
            PayMongo QR Ph
          </p>
          <h2 className="mt-1 text-lg font-black text-navy">
            Complete secure payment
          </h2>
        </div>
        <HoldCountdown
          expiresAt={payment.expiresAt.toISOString()}
          initialSeconds={payment.secondsLeft}
          label="Time left"
        />
      </div>
      {payment.chargeInFlight &&
      (payment.qrImageUrl || payment.redirectUrl) ? (
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
          venueName={venueName}
          expiresAt={payment.expiresAt.toISOString()}
          initialSeconds={payment.secondsLeft}
        />
      )}
    </section>
  );
}

function BookingDetailsCard({
  venueName,
  bookings,
}: {
  venueName: string;
  bookings: Array<{
    id: string;
    date: string;
    startHour: number;
    endHour: number;
    hours: number;
    court: { name: string };
  }>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <CardHeading icon="calendar" eyebrow="Reservation" title="Court details" />
      <dl className="mt-5 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-slate-500">Venue</dt>
          <dd className="text-right font-bold text-navy">{venueName}</dd>
        </div>
      </dl>
      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        {bookings.map((booking) => (
          <div key={booking.id} className="rounded-xl bg-[#f7faf8] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-black text-navy">
                {booking.court.name}
              </p>
              <p className="shrink-0 text-xs font-semibold text-slate-500">
                {booking.hours} {booking.hours === 1 ? "hour" : "hours"}
              </p>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {formatManilaDate(booking.date)} ·{" "}
              {formatSlotRange(booking.startHour, booking.endHour)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceBreakdownCard({
  payment,
  bookings,
}: {
  payment: BookingPaymentView | undefined;
  bookings: Array<{ totalPrice: unknown; hours: number }>;
}) {
  const courtTotal =
    payment?.venueAmount ??
    bookings.reduce(
      (sum, booking) => sum + Number(booking.totalPrice ?? 0),
      0
    );
  const total = payment?.payableAmount ?? courtTotal;
  const hours = bookings.reduce((sum, booking) => sum + booking.hours, 0);
  const paymentReference = payment?.manualPaymentRef?.trim();
  const paymentDetail = [
    payment?.manualMethodLabel,
    paymentReference
      ? paymentReference.length > 4
        ? `Reference ending in ${paymentReference.slice(-4)}`
        : `Reference ${paymentReference}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <CardHeading
        icon="wallet"
        eyebrow={
          payment?.collectionMode === "MANUAL"
            ? "Manual payment"
            : payment
              ? "PayMongo QR Ph"
              : "Booking total"
        }
        title="Price breakdown"
      />
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">
            Court time · {hours} {hours === 1 ? "hour" : "hours"}
          </dt>
          <dd className="font-bold text-navy">{formatPHP(courtTotal)}</dd>
        </div>
        {payment && payment.platformFee > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Service fee</dt>
            <dd className="font-bold text-navy">
              {formatPHP(payment.platformFee)}
            </dd>
          </div>
        )}
        {payment && payment.processingFee > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Processing fee</dt>
            <dd className="font-bold text-navy">
              {formatPHP(payment.processingFee)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
          <dt className="font-black text-navy">
            {payment?.manualSubmittedAt ? "Total submitted" : "Total"}
          </dt>
          <dd className="font-mono text-lg font-black text-navy">
            {formatPHP(total)}
          </dd>
        </div>
      </dl>
      {paymentDetail && (
        <p className="mt-4 break-all rounded-xl bg-[#f7faf8] px-3 py-2.5 text-xs leading-5 text-slate-500">
          {paymentDetail}
        </p>
      )}
    </section>
  );
}

function GuestContactCard({
  access,
}: {
  access: { name: string; phone: string; email: string };
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <CardHeading icon="user" title="Guest contact" />
      <div className="mt-5 space-y-3 text-sm">
        <p className="font-bold text-navy">{access.name}</p>
        <p className="flex items-start gap-2 break-all text-slate-500">
          <ContactIcon kind="email" />
          {access.email}
        </p>
        <p className="flex items-center gap-2 text-slate-500">
          <ContactIcon kind="phone" />
          {access.phone}
        </p>
      </div>
    </section>
  );
}

function VenueContactCard({
  venueName,
  venueHref,
  phone,
  email,
}: {
  venueName: string;
  venueHref: string;
  phone: string | null;
  email: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <CardHeading icon="pin" title="Venue contact" />
      <p className="mt-5 text-sm font-bold text-navy">{venueName}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        For receipt, transfer, or booking questions, contact the venue directly.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-navy transition-colors hover:border-primary hover:bg-primary-soft"
          >
            <ContactIcon kind="phone" />
            Call venue
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-navy transition-colors hover:border-primary hover:bg-primary-soft"
          >
            <ContactIcon kind="email" />
            Email venue
          </a>
        )}
        {!phone && !email && (
          <Link
            href={venueHref}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-navy transition-colors hover:border-primary hover:bg-primary-soft"
          >
            View venue
          </Link>
        )}
      </div>
    </section>
  );
}

function PrivateBookingNotice() {
  return (
    <aside className="mt-5 flex items-start gap-3 rounded-2xl border border-ocean/20 bg-ocean-soft p-4 sm:p-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-ocean">
        <ShieldIcon />
      </span>
      <div>
        <h2 className="text-sm font-black text-navy">
          This is a private booking link
        </h2>
        <p className="mt-1 text-xs leading-5 text-navy/70">
          Anyone with access to this browser session may view this reservation.
          Do not forward the email link. Bunal.club will never ask you to share
          this private link or your payment credentials.
        </p>
      </div>
    </aside>
  );
}

function CardHeading({
  icon,
  eyebrow,
  title,
}: {
  icon: "calendar" | "wallet" | "user" | "pin";
  eyebrow?: string;
  title: string;
}) {
  const tone =
    icon === "wallet"
      ? "bg-ocean-soft text-ocean"
      : icon === "user"
        ? "bg-navy-soft text-navy"
        : "bg-primary-soft text-primary";

  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
      >
        <CardIcon kind={icon} />
      </span>
      <div>
        {eyebrow && (
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            {eyebrow}
          </p>
        )}
        <h2 className="text-base font-black text-navy">{title}</h2>
      </div>
    </div>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function StatusIcon({ statusKind }: { statusKind: BookingStatusKind }) {
  if (statusKind === "confirmed") {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }
  if (statusKind === "declined" || statusKind === "expired") {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </svg>
    );
  }
  if (statusKind === "processing" || statusKind === "payment") {
    return (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zm4 4h3v3h-3z" />
      </svg>
    );
  }
  return (
    <svg {...iconProps}>
      <path d="M6 3h12v4a6 6 0 0 1-12 0V3Z" />
      <path d="M6 14h12v7H6z" />
      <path d="m9 17 2 2 4-4" />
    </svg>
  );
}

function CardIcon({
  kind,
}: {
  kind: "calendar" | "wallet" | "user" | "pin";
}) {
  if (kind === "calendar") {
    return (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </svg>
    );
  }
  if (kind === "wallet") {
    return (
      <svg {...iconProps}>
        <path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
        <path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
      </svg>
    );
  }
  if (kind === "user") {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }
  return (
    <svg {...iconProps}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function ContactIcon({ kind }: { kind: "email" | "phone" }) {
  return kind === "email" ? (
    <svg {...iconProps} width="16" height="16" className="mt-0.5 shrink-0 text-ocean">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ) : (
    <svg {...iconProps} width="16" height="16" className="shrink-0 text-ocean">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconProps} width="18" height="18">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
