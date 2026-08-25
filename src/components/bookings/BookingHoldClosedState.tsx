import Link from "next/link";

import type { BookingPaymentLine } from "@/lib/booking-payments";
import { formatPHP } from "@/lib/currency";
import { formatManilaDate, formatSlotRange } from "@/lib/time";

export function BookingHoldClosedState({
  cancelled,
  venueName,
  venueHref,
  paymentId,
  lines,
  venueAmount,
  platformFee,
  processingFee,
  payableAmount,
}: {
  cancelled: boolean;
  venueName: string;
  venueHref: string;
  paymentId: string;
  lines: BookingPaymentLine[];
  venueAmount: number;
  platformFee: number;
  processingFee: number;
  payableAmount: number;
}) {
  const reference = paymentId.slice(-8).toUpperCase();
  const totalHours = lines.reduce((sum, line) => sum + line.hours, 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
            Booking payment
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-navy sm:text-4xl">
            {cancelled ? "Reservation cancelled" : "Reservation expired"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {venueName} · Reference{" "}
            <span className="font-mono font-bold text-navy">{reference}</span>
          </p>
        </div>
        <span className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800">
          <span className="size-2 rounded-full bg-current" aria-hidden="true" />
          {cancelled ? "Released" : "Expired"}
        </span>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(16,36,58,0.06)]">
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <ClockIcon />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">
                {cancelled ? "Reservation released" : "Payment window ended"}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-navy sm:text-2xl">
                {cancelled
                  ? "Your court hours are available again."
                  : "The booking was not completed in time."}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {cancelled
                  ? "You released this reservation before payment completed. Other players can now book the selected hours."
                  : "The reservation hold ended before payment completed, so the selected court hours returned to availability."}
              </p>
              <p className="mt-3 inline-flex rounded-lg border border-amber-200 bg-white/75 px-3 py-2 text-sm font-bold text-navy">
                Nothing was charged.
              </p>
            </div>
          </div>
        </div>

        <ol
          aria-label="Reservation outcome"
          className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3 sm:p-7"
        >
          <OutcomeStep
            number="1"
            title="Slots selected"
            detail={`${totalHours} ${totalHours === 1 ? "court-hour" : "court-hours"} held`}
            tone="complete"
          />
          <OutcomeStep
            number="2"
            title={cancelled ? "Hold released" : "Payment incomplete"}
            detail={cancelled ? "Released by you" : "Time window ended"}
            tone="warning"
          />
          <OutcomeStep
            number="3"
            title="Slots available"
            detail="Open for a new booking"
            tone="neutral"
          />
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <CardHeading eyebrow="Reservation" title="Previous court selection" />
          <div className="mt-5 space-y-3">
            {lines.map((line) => (
              <div
                key={line.bookingId}
                className="rounded-xl bg-[#f7faf8] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-navy">
                    {line.courtName}
                  </p>
                  <p className="shrink-0 text-xs font-semibold text-slate-500">
                    {line.hours} {line.hours === 1 ? "hour" : "hours"}
                  </p>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {formatManilaDate(line.date)} ·{" "}
                  {formatSlotRange(line.startHour, line.endHour)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <CardHeading eyebrow="Not charged" title="Previous total" />
          <dl className="mt-5 space-y-3 text-sm">
            <PriceRow label="Court time" value={venueAmount} />
            {platformFee > 0 && (
              <PriceRow label="Service fee" value={platformFee} />
            )}
            {processingFee > 0 && (
              <PriceRow label="PayMongo processing fee" value={processingFee} />
            )}
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
              <dt className="font-black text-navy">Previous total</dt>
              <dd className="font-mono text-lg font-black text-navy">
                {formatPHP(payableAmount)}
              </dd>
            </div>
          </dl>
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-black text-green-800">
              No payment was collected
            </p>
            <p className="mt-1 text-xs leading-5 text-green-700">
              No court fee, service fee, or processing fee was charged.
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-2xl bg-navy p-5 text-white shadow-[0_14px_35px_rgba(16,36,58,0.16)] sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">
              Next step
            </p>
            <h2 className="mt-1 text-xl font-black">Ready to try again?</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-white/65">
              Availability may have changed. Check the venue for open hours or
              return to your bookings.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href="/dashboard/bookings"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              View my bookings
            </Link>
            <Link
              href={venueHref}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-black/15 transition-colors hover:bg-primary-hover"
            >
              Check availability
              <span aria-hidden="true" className="ml-2">→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function OutcomeStep({
  number,
  title,
  detail,
  tone,
}: {
  number: string;
  title: string;
  detail: string;
  tone: "complete" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "complete"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_15px_rgba(16,36,58,0.04)]">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black ${toneClass}`}
      >
        {tone === "complete" ? "✓" : number}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black text-navy">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

function CardHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ocean">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-black text-navy">{title}</h2>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold text-navy">{formatPHP(value)}</dd>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
