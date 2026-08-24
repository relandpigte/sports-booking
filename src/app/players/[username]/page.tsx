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
      <section className="py-6 sm:py-8">
        <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar src={player.image} name={name} size={84} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">
                      Player profile
                    </p>
                    <h1 className="mt-0.5 text-3xl font-extrabold tracking-[-0.04em] text-navy">
                      {name}
                    </h1>
                  </div>
                  {trainer && (
                    <span className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                      <BadgeCheckIcon />
                      Verified trainer
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm capitalize text-slate-500">
                  {player.skillLevel} player
                </p>
                {trainer && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                    {trainer.sports.map((game) => (
                      <span key={game} className="inline-flex items-center gap-1.5">
                        <SportIcon />
                        <strong className="font-semibold text-foreground">
                          {GAME_LABELS[game] ?? game}
                        </strong>
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon />
                      {trainer.area}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <UsersIcon />
                      In person
                    </span>
                  </div>
                )}
              </div>
            </div>
            {trainer && (
              <div className="flex shrink-0 flex-col gap-1 border-t border-[#dfe7e2] pt-4 lg:items-end lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <p className="text-2xl font-extrabold tracking-tight text-primary">
                  ₱
                  {Number(trainer.hourlyRate).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                  <span className="text-sm font-semibold text-slate-500"> / hour</span>
                </p>
                <a
                  href={trainer.facebookPage ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                >
                  View verified Facebook Page
                  <ExternalLinkIcon />
                </a>
              </div>
            )}
          </div>
        </div>

        {trainer && (
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
            <article className="min-w-0 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white">
              <section className="p-5 sm:p-6">
                <h2 className="text-xl font-extrabold tracking-tight text-navy">
                  Training profile
                </h2>
                <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-slate-600">
                  {trainer.bio}
                </p>
              </section>

              <section className="border-t border-[#dfe7e2] p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-extrabold text-navy">Specialties</h3>
                  <ul className="flex flex-wrap gap-2">
                    {trainer.specialties.map((item) => (
                      <li
                        key={item}
                        className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="border-t border-[#dfe7e2] p-5 sm:p-6">
                <h3 className="font-extrabold text-navy">Weekly availability</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {trainer.weeklyRules.map((rule) => (
                    <div
                      key={`${rule.dayOfWeek}-${rule.startHour}-${rule.endHour}`}
                      className="rounded-xl bg-[#f7faf8] px-3 py-2.5 text-xs leading-5 text-slate-500"
                    >
                      <strong className="block text-navy">
                        {dayNames[rule.dayOfWeek]}
                      </strong>
                      {formatHourLabel(rule.startHour)}–{formatHourLabel(rule.endHour)}
                    </div>
                  ))}
                </div>
              </section>

              <section
                className={`grid border-t border-[#dfe7e2] ${
                  trainer.certifications ? "md:grid-cols-2" : ""
                }`}
              >
                <div
                  className={`p-5 sm:p-6 ${
                    trainer.certifications ? "md:border-r md:border-[#dfe7e2]" : ""
                  }`}
                >
                  <h3 className="font-extrabold text-navy">Experience</h3>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                    {trainer.experience}
                  </p>
                </div>
                {trainer.certifications && (
                  <div className="border-t border-[#dfe7e2] p-5 sm:p-6 md:border-t-0">
                    <h3 className="font-extrabold text-navy">Certifications</h3>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                      {trainer.certifications}
                    </p>
                  </div>
                )}
              </section>
            </article>
            <aside className="xl:sticky xl:top-8">
              {viewer?.role === "PLAYER" && viewer.id !== player.id ? (
                <TrainerRequestForm
                  trainerProfileId={trainer.id}
                  hourlyRate={Number(trainer.hourlyRate)}
                  minDate={manilaToday()}
                  maxDate={addDays(manilaToday(), TRAINER_BOOKING_WINDOW_DAYS)}
                />
              ) : viewer ? (
                <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 text-sm text-slate-600">
                  {viewer.id === player.id
                    ? "This is your public trainer profile."
                    : "Session requests require a player account."}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5">
                  <h2 className="font-extrabold text-navy">Request a session</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Sign in with a player account to choose a time.
                  </p>
                  <Link
                    href={`/login?callbackUrl=/players/${username}`}
                    className="mt-4 block min-h-11 rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
                  >
                    Log in to request
                  </Link>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function BadgeCheckIcon() {
  return (
    <svg
      className="mr-1.5 h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 12 2 2 4-4" />
      <path d="M12 3 9.5 5 6.3 4.6 5.9 7.8 4 10.3 6 12.8 6.3 16l3.2-.4L12 18l2.5-2.4 3.2.4.4-3.2 1.9-2.5-1.9-2.5-.4-3.2-3.2.4Z" />
    </svg>
  );
}

function SportIcon() {
  return (
    <svg
      className="h-4 w-4 text-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 5.5c3 2 6 5 8.5 10.5M5.5 16.5c3-2 6-5 8.5-10.5" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      className="h-4 w-4 text-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      className="h-4 w-4 text-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
