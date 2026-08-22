import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import {
  TrainerConfirmedActions,
  TrainerManualReview,
  TrainerPendingManualRefund,
  TrainerRequestDecision,
} from "@/components/trainers/TrainerSessionActions";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
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
    <div className="space-y-6">
      <DashboardPageHeader eyebrow="Trainer tools" title="Sessions" description="Accept requests, review manual payments, reschedule confirmed sessions, and manage refunds." />
      <TrainerTabs />
      <div className="space-y-4">
        {sessions.map((session) => (
          <article key={session.id} className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-primary">{session.player.playerName ?? session.player.name ?? session.player.email}</p>
                <h2 className="mt-1 text-lg font-black text-navy">{formatManilaDateLong(session.date)} · {formatSlotRange(session.startHour, session.endHour)}</h2>
                <p className="mt-1 text-sm text-slate-500">{session.hours} {session.hours === 1 ? "hour" : "hours"} · ₱{Number(session.trainerAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} trainer rate</p>
              </div>
              <Badge tone={tones[session.status] ?? "neutral"}>{session.status.replaceAll("_", " ")}</Badge>
            </div>
            {session.notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{session.notes}</p>}
            {session.status === "REQUESTED" && <TrainerRequestDecision sessionId={session.id} />}
            {session.status === "PAYMENT_REVIEW" && session.payment?.manualReceiptImage && <TrainerManualReview paymentId={session.payment.id} receiptImage={session.payment.manualReceiptImage} paymentRef={session.payment.manualPaymentRef} />}
            {session.status === "CONFIRMED" && <TrainerConfirmedActions sessionId={session.id} currentDate={session.date} currentStartHour={session.startHour} />}
            {session.payment?.refundRequestedAt && session.payment.status === "SUCCEEDED" && <TrainerPendingManualRefund sessionId={session.id} amount={Number(session.payment.trainerAmount).toFixed(2)} />}
          </article>
        ))}
        {sessions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No session requests yet.</div>}
      </div>
    </div>
  );
}
