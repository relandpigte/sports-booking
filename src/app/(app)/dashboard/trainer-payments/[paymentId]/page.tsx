import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TrainerCheckout } from "@/components/trainers/TrainerCheckout";
import { formatPHP } from "@/lib/currency";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { trainerPaymentSecondsLeft } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Payment — Bunal.club" };

export default async function TrainerPaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");

  const { paymentId } = await params;
  const payment = await prisma.trainerPayment.findFirst({
    where: { id: paymentId, playerId: user.id },
    include: {
      session: {
        include: {
          trainer: {
            include: {
              user: { select: { name: true, playerName: true } },
            },
          },
        },
      },
    },
  });
  if (!payment) notFound();

  const trainerName =
    payment.session.trainer.user.playerName ??
    payment.session.trainer.user.name ??
    "Trainer";
  const secondsLeft = trainerPaymentSecondsLeft(payment.expiresAt);
  const checkoutVisible =
    payment.status === "PENDING" &&
    (secondsLeft > 0 || payment.manualSubmittedAt != null);
  const summary = {
    trainerName,
    dateLabel: formatManilaDateLong(payment.session.date),
    timeLabel: formatSlotRange(
      payment.session.startHour,
      payment.session.endHour
    ),
    hours: payment.session.hours,
  };

  if (checkoutVisible) {
    return (
      <TrainerCheckout
        summary={summary}
        payment={{
          id: payment.id,
          amount: Number(payment.amount),
          trainerAmount: Number(payment.trainerAmount),
          platformFee: Number(payment.platformFee),
          processingFee: Number(payment.processingFee),
          processingFeeResponsibility:
            payment.processingFeeResponsibility,
          expiresAt: payment.expiresAt.toISOString(),
          initialSeconds: secondsLeft,
          chargeInFlight:
            payment.chargeStartedAt != null &&
            payment.providerPaymentId != null,
          collectionMode: payment.collectionMode,
          qrImageUrl: payment.qrImageUrl,
          redirectUrl: payment.redirectUrl,
          failureMessage: payment.failureMessage,
          manualSubmittedAt: payment.manualSubmittedAt?.toISOString() ?? null,
          manualMethodLabel: payment.manualMethodLabel,
          manualAccountName: payment.manualAccountName,
          manualAccountDetails: payment.manualAccountDetails,
          manualInstructions: payment.manualInstructions,
          manualQrImage: payment.manualQrImage,
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm shadow-navy/5 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
          Trainer session payment
        </p>
        <h1 className="mt-2 text-2xl font-black text-navy sm:text-3xl">
          {payment.status === "SUCCEEDED"
            ? "Session confirmed"
            : payment.status === "REFUNDED"
              ? "Payment refunded"
              : payment.status === "PENDING"
                ? "Payment window expired"
                : "Payment closed"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {trainerName} · {summary.dateLabel} · {summary.timeLabel}
        </p>

        {payment.status === "SUCCEEDED" && (
          <div className="mt-6 text-left">
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
              Paid {formatPHP(Number(payment.amount))}. Your trainer session is
              confirmed.
            </p>
            <p className="mt-5 text-sm font-bold text-navy">
              Exact meeting instructions
            </p>
            <p className="mt-2 whitespace-pre-line rounded-xl bg-primary-soft p-4 text-sm font-semibold leading-6 text-navy">
              {payment.session.trainer.locationDetails}
            </p>
          </div>
        )}

        {payment.status === "REFUNDED" && (
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            {payment.refundReason ?? "This trainer payment was refunded."}{" "}
            {payment.refundedAmount
              ? `${formatPHP(Number(payment.refundedAmount))} was returned.`
              : ""}
          </p>
        )}

        {payment.status === "FAILED" && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {payment.failureMessage ??
              "The payment could not be completed and the trainer hours were released."}
          </p>
        )}

        {payment.status === "PENDING" && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            The payment window ended before confirmation, so these trainer
            hours are no longer reserved. Nothing new can be submitted from
            this page.
          </p>
        )}

        <Link
          href="/dashboard/bookings?type=trainers"
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover sm:w-auto"
        >
          View my trainer sessions
        </Link>
      </section>
    </div>
  );
}
