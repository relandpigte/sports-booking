import Link from "next/link";

import { PlayerTrainerCancellation } from "@/components/trainers/TrainerSessionActions";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

const tones: Record<string, BadgeTone> = { REQUESTED: "warn", AWAITING_PAYMENT: "warn", PAYMENT_REVIEW: "warn", CONFIRMED: "success", COMPLETED: "neutral", DECLINED: "danger", EXPIRED: "neutral", CANCELLED: "danger", REFUNDED: "neutral" };

export type PlayerTrainerSessionView = {
  id: string;
  status: string;
  date: string;
  startHour: number;
  endHour: number;
  startsAt: Date;
  totalAmount: { toString(): string };
  trainerAmount: { toString(): string };
  trainer: { area: string | null; locationDetails: string | null; user: { username: string | null; name: string | null; playerName: string | null } };
  payment: { id: string; status: string } | null;
};

export function PlayerTrainerSessionCard({ session }: { session: PlayerTrainerSessionView }) {
  const name = session.trainer.user.playerName ?? session.trainer.user.name ?? "Trainer";
  const canCancel = ["REQUESTED", "AWAITING_PAYMENT", "PAYMENT_REVIEW", "CONFIRMED"].includes(session.status) && session.startsAt > new Date();
  return <article className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-primary">Trainer session</p><h3 className="mt-1 text-lg font-black text-navy">{name}</h3><p className="mt-1 text-sm text-slate-500">{formatManilaDateLong(session.date)} · {formatSlotRange(session.startHour, session.endHour)}</p></div><Badge tone={tones[session.status] ?? "neutral"}>{session.status.replaceAll("_", " ")}</Badge></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{session.status === "CONFIRMED" ? session.trainer.locationDetails : session.trainer.area}</p><p className="font-black text-navy">₱{Number(session.totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></div>
    <div className="mt-4 flex flex-wrap gap-2">{session.trainer.user.username && <Link href={`/players/${session.trainer.user.username}`} className="rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary">Trainer profile</Link>}{session.status === "AWAITING_PAYMENT" && session.payment && <Link href={`/dashboard/trainer-payments/${session.payment.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Pay now</Link>}{session.status === "CONFIRMED" && <Link href="/dashboard/messages" className="rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white">Message trainer</Link>}</div>
    {canCancel && <PlayerTrainerCancellation sessionId={session.id} paid={session.payment?.status === "SUCCEEDED"} />}
  </article>;
}
