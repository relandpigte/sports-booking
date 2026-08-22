import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { Avatar } from "@/components/ui/Avatar";
import { GAME_LABELS, GAME_VALUES } from "@/lib/constants";
import { formatManilaDate, manilaToday } from "@/lib/time";
import { listPublicTrainers } from "@/lib/trainers";

export const metadata: Metadata = {
  title: "Find a Sports Trainer — Bunal.club",
  description: "Discover verified trainers, compare rates, and request a session on Bunal.club.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = first(params.q).slice(0, 100);
  const sportValue = first(params.sport);
  const sport = GAME_VALUES.includes(sportValue as (typeof GAME_VALUES)[number])
    ? sportValue
    : undefined;
  const area = first(params.area).slice(0, 100);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(first(params.date))
    ? first(params.date)
    : undefined;
  const parsedRate = Number(first(params.maxRate));
  const maxRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : undefined;
  const trainers = await listPublicTrainers({ query, sport, area, date, maxRate });

  return (
    <PageShell maxWidth="max-w-7xl" backgroundClass="bg-[#f7faf8]">
      <section className="py-10 sm:py-14">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Verified coaching</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] text-navy sm:text-5xl">Find your trainer</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Browse admin-reviewed trainers, request their available time, and pay securely only after they accept.
        </p>

        <form className="mt-8 grid gap-3 rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
          <input name="q" defaultValue={query} placeholder="Name or specialty" className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm lg:col-span-2" />
          <select name="sport" defaultValue={sport ?? ""} className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm">
            <option value="">All sports</option>
            {GAME_VALUES.map((game) => <option key={game} value={game}>{GAME_LABELS[game]}</option>)}
          </select>
          <input name="area" defaultValue={area} placeholder="Area" className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm" />
          <input name="date" type="date" min={manilaToday()} defaultValue={date} aria-label="Available date" className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm" />
          <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white">Search</button>
          <input name="maxRate" type="number" min="1" step="1" defaultValue={maxRate} placeholder="Max hourly rate" className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm lg:col-start-5" />
        </form>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {trainers.map((trainer) => {
            const name = trainer.user.playerName ?? trainer.user.name ?? "Bunal.club trainer";
            return (
              <Link key={trainer.id} href={`/players/${trainer.user.username}`} className="group rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <div className="flex items-start gap-4">
                  <Avatar src={trainer.user.image} name={name} size={64} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black text-navy">{name}</h2><span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700">Verified</span></div>
                    <p className="mt-1 text-sm text-slate-500">{trainer.area} · In person</p>
                    <p className="mt-2 font-black text-primary">₱{Number(trainer.hourlyRate).toLocaleString("en-PH", { minimumFractionDigits: 2 })}<span className="text-xs font-semibold text-slate-400"> / hour</span></p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{trainer.bio}</p>
                <div className="mt-4 flex flex-wrap gap-2">{trainer.sports.map((game) => <span key={game} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">{GAME_LABELS[game] ?? game}</span>)}</div>
                {date && <p className="mt-4 text-xs font-semibold text-slate-500">Available on {formatManilaDate(date)}</p>}
              </Link>
            );
          })}
        </div>
        {trainers.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center"><h2 className="font-black text-navy">No trainers match those filters</h2><p className="mt-1 text-sm text-slate-500">Try another sport, area, date, or rate.</p></div>}
      </section>
    </PageShell>
  );
}
