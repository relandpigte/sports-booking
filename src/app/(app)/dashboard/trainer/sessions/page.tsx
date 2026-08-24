import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  TrainerConfirmedActions,
  TrainerManualReview,
  TrainerPendingManualRefund,
  TrainerRequestDecision,
} from "@/components/trainers/TrainerSessionActions";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { TrainerWorkspaceHeader } from "@/components/trainers/TrainerWorkspaceHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "Trainer Sessions — Bunal.club" };

const tones: Record<string, BadgeTone> = {
  REQUESTED: "warn",
  AWAITING_PAYMENT: "warn",
  PAYMENT_REVIEW: "warn",
  CONFIRMED: "success",
  COMPLETED: "neutral",
  DECLINED: "danger",
  EXPIRED: "neutral",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

export default async function TrainerSessionsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect("/dashboard/trainer");
  const sessions = await prisma.trainerSession.findMany({
    where: { trainerProfileId: profile.id },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    include: {
      player: { select: { name: true, playerName: true, email: true } },
      payment: true,
    },
  });

  return (
    <div>
      <TrainerWorkspaceHeader
        title="Sessions"
        description="Accept requests, review manual payments, reschedule confirmed sessions, and manage refunds."
        calloutLabel="Operational inbox"
        callout="Review the status and complete the single next action shown on each session."
        icon="sessions"
      />
      <div className="mt-6">
        <TrainerTabs />
      </div>
      <section aria-label="Trainer sessions" className="mt-6 space-y-4">
        {sessions.map((session) => (
          <article
            key={session.id}
            className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm"
          >
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                    {session.player.playerName ??
                      session.player.name ??
                      session.player.email}
                  </p>
                  <h2 className="mt-1 text-lg font-black text-navy sm:text-xl">
                    {formatManilaDateLong(session.date)} ·{" "}
                    {formatSlotRange(session.startHour, session.endHour)}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>
                      {session.hours}{" "}
                      {session.hours === 1 ? "hour" : "hours"}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>
                      ₱
                      {Number(session.trainerAmount).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      trainer rate
                    </span>
                  </div>
                </div>
                <Badge tone={tones[session.status] ?? "neutral"}>
                  {session.status.replaceAll("_", " ")}
                </Badge>
              </div>
              {session.notes && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Player note
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {session.notes}
                  </p>
                </div>
              )}
              {session.status === "REQUESTED" && (
                <TrainerRequestDecision sessionId={session.id} />
              )}
              {session.status === "PAYMENT_REVIEW" &&
                session.payment?.manualReceiptImage && (
                  <TrainerManualReview
                    paymentId={session.payment.id}
                    receiptImage={session.payment.manualReceiptImage}
                    paymentRef={session.payment.manualPaymentRef}
                  />
                )}
              {session.status === "CONFIRMED" && (
                <TrainerConfirmedActions
                  sessionId={session.id}
                  currentDate={session.date}
                  currentStartHour={session.startHour}
                />
              )}
              {session.payment?.refundRequestedAt &&
                session.payment.status === "SUCCEEDED" && (
                  <TrainerPendingManualRefund
                    sessionId={session.id}
                    amount={Number(session.payment.trainerAmount).toFixed(2)}
                  />
                )}
            </div>
          </article>
        ))}
        {sessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <EmptySessionsIcon />
            </span>
            <h2 className="mt-4 font-black text-navy">No session requests yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
              New player requests and payment reviews will appear here with the
              next action you need to take.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function EmptySessionsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 18h7" />
    </svg>
  );
}
