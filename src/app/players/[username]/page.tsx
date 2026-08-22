import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { TrainerRequestForm } from "@/components/trainers/TrainerRequestForm";
import { Avatar } from "@/components/ui/Avatar";
import { GAME_LABELS, TRAINER_BOOKING_WINDOW_DAYS } from "@/lib/constants";
import { getViewer } from "@/lib/dal";
import { getPublicPlayer, getPublicTrainer } from "@/lib/trainers";
import { addDays, formatHourLabel, manilaToday } from "@/lib/time";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const player = await getPublicPlayer(username);
  return player ? { title: `${player.playerName ?? player.name ?? username} — Bunal.club` } : {};
}

export default async function PublicPlayerPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [player, trainer, viewer] = await Promise.all([
    getPublicPlayer(username),
    getPublicTrainer(username),
    getViewer(),
  ]);
  if (!player) notFound();
  const name = player.playerName ?? player.name ?? username;

  return (
    <PageShell maxWidth="max-w-6xl" backgroundClass="bg-[#f7faf8]">
      <section className="py-10 sm:py-14">
        <div className="rounded-3xl border border-[#dfe7e2] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar src={player.image} name={name} size={112} />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Player profile</p>
              <h1 className="mt-1 text-4xl font-black tracking-[-0.04em] text-navy">{name}</h1>
              <p className="mt-2 text-sm capitalize text-slate-500">{player.skillLevel} player</p>
              {trainer && <span className="mt-3 inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">Verified trainer</span>}
            </div>
          </div>
        </div>

        {trainer && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <article className="rounded-2xl border border-[#dfe7e2] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-black text-navy">Training profile</h2><p className="text-xl font-black text-primary">₱{Number(trainer.hourlyRate).toLocaleString("en-PH", { minimumFractionDigits: 2 })}<span className="text-sm text-slate-400"> / hour</span></p></div>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{trainer.bio}</p>
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Area</dt><dd className="mt-1 font-semibold text-navy">{trainer.area}</dd></div>
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Setting</dt><dd className="mt-1 font-semibold text-navy">In person</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">{trainer.sports.map((game) => <span key={game} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{GAME_LABELS[game] ?? game}</span>)}</div>
                <h3 className="mt-6 font-black text-navy">Specialties</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{trainer.specialties.map((item) => <li key={item}>{item}</li>)}</ul>
                <h3 className="mt-6 font-black text-navy">Weekly availability</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{trainer.weeklyRules.map((rule) => <div key={`${rule.dayOfWeek}-${rule.startHour}-${rule.endHour}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"><strong className="text-navy">{dayNames[rule.dayOfWeek]}</strong> · {formatHourLabel(rule.startHour)}–{formatHourLabel(rule.endHour)}</div>)}</div>
                <h3 className="mt-6 font-black text-navy">Experience</h3><p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{trainer.experience}</p>
                {trainer.certifications && <><h3 className="mt-6 font-black text-navy">Certifications</h3><p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{trainer.certifications}</p></>}
                <a href={trainer.facebookPage ?? "#"} target="_blank" rel="noreferrer" className="mt-6 inline-flex text-sm font-bold text-primary hover:underline">View verified Facebook Page ↗</a>
              </article>
            </div>
            <aside>
              {viewer?.role === "PLAYER" && viewer.id !== player.id ? <TrainerRequestForm trainerProfileId={trainer.id} hourlyRate={Number(trainer.hourlyRate)} minDate={manilaToday()} maxDate={addDays(manilaToday(), TRAINER_BOOKING_WINDOW_DAYS)} /> : viewer ? <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 text-sm text-slate-600">{viewer.id === player.id ? "This is your public trainer profile." : "Session requests require a player account."}</div> : <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"><h2 className="font-black text-navy">Request a session</h2><p className="mt-2 text-sm text-slate-500">Sign in with a player account to choose a time.</p><Link href={`/login?callbackUrl=/players/${username}`} className="mt-4 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-white">Log in to request</Link></div>}
            </aside>
          </div>
        )}
      </section>
    </PageShell>
  );
}
