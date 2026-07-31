import Link from "next/link";

import { PublicTopBar } from "@/components/hubs/PublicTopBar";

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 transition-transform group-hover:translate-x-1"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CourtScoreboard() {
  return (
    <div className="relative aspect-[16/10] w-full max-w-[580px] overflow-hidden rounded-[24px] border border-white/10 bg-navy shadow-2xl shadow-navy/15 sm:rounded-[32px]">
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-ocean/15 blur-3xl"
      />

      <div className="absolute inset-4 sm:inset-6">
        <div className="relative flex h-full overflow-hidden rounded-xl border-2 border-white/20">
          <div className="relative flex-1 border-r border-white/15">
            <div className="absolute inset-y-0 left-1/3 border-l border-white/10" />
            <div className="absolute inset-x-0 top-1/2 border-t border-white/15" />
          </div>
          <div className="w-4 border-x border-white/15 bg-white/5 sm:w-7" />
          <div className="relative flex-1">
            <div className="absolute inset-y-0 right-1/3 border-r border-white/10" />
            <div className="absolute inset-x-0 top-1/2 border-t border-white/15" />
          </div>

          <p className="absolute inset-0 flex items-center justify-center text-[clamp(5rem,20vw,9rem)] font-black leading-none tracking-[-0.08em] text-white/10">
            404
          </p>

          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-2.5 py-2 backdrop-blur-sm sm:right-5 sm:top-5 sm:gap-3 sm:px-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-navy">
              ×
            </span>
            <span className="leading-none">
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
                Status
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase text-white sm:text-xs">
                Out of bounds
              </span>
            </span>
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-2 sm:bottom-5 sm:left-5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50 sm:text-[10px]">
              Court unavailable
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7faf8]">
      <PublicTopBar />

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 md:py-16 lg:px-8">
        <div className="grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-1 flex flex-col items-center text-center lg:items-start lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              Out of bounds
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.08] tracking-[-0.045em] text-navy sm:text-5xl lg:text-6xl">
              This page missed
              <br className="hidden lg:block" /> the court.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-500 sm:text-lg">
              The link you followed may be outdated or the page has moved.
              Let&apos;s get you back into the game.
            </p>

            <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/hubs"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-8 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.98] sm:w-auto"
              >
                Browse hubs
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-navy px-8 text-sm font-bold text-navy transition-all hover:bg-navy/5 active:scale-[0.98] sm:w-auto"
              >
                Go home
              </Link>
            </div>

            <Link
              href="/dashboard/bookings"
              className="group mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ocean transition-colors hover:text-navy"
            >
              View my bookings
              <ArrowRightIcon />
            </Link>
          </div>

          <div className="order-2 flex w-full justify-center lg:justify-end">
            <CourtScoreboard />
          </div>
        </div>

        <p className="mt-12 text-center text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 md:mt-16">
          Play · Compete · Connect
        </p>
      </main>
    </div>
  );
}
