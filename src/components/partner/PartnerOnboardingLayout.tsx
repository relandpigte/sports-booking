import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/Logo";

function Benefit({
  icon,
  title,
  children,
}: {
  icon: "calendar" | "payment" | "chart";
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent">
        {icon === "calendar" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18M9 16l2 2 4-4" />
          </svg>
        ) : icon === "payment" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20M7 15h2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18M7 16l4-5 3 3 5-7" />
          </svg>
        )}
      </span>
      <div>
        <h3 className="font-bold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-white/60">{children}</p>
      </div>
    </li>
  );
}

export function PartnerOnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7faf8] lg:flex">
      <aside className="relative overflow-hidden bg-navy px-5 py-6 sm:px-8 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[38%] lg:max-w-xl lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative">
          <Link href="/" aria-label="Bunal.club home">
            <Logo size="standard" />
          </Link>

          <div className="mt-14 hidden lg:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
              Partner onboarding
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white">
              Put your courts on
              <br />
              <span className="text-accent">Bunal.club.</span>
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
              Create your venue profile now. After approval, connect PayMongo
              and finish your courts before the hub goes live.
            </p>

            <ul className="mt-10 space-y-7">
              <Benefit icon="calendar" title="Live court scheduling">
                Players see current availability and reserve without the
                back-and-forth messaging.
              </Benefit>
              <Benefit icon="payment" title="Direct PayMongo payments">
                Booking proceeds go through the payment account your venue
                connects.
              </Benefit>
              <Benefit icon="chart" title="Operational clarity">
                Manage hubs, bookings, court revenue, and service fees from one
                dashboard.
              </Benefit>
            </ul>
          </div>
        </div>

        <p className="relative hidden text-xs font-medium uppercase tracking-[0.2em] text-white/30 lg:block">
          Play · Compete · Connect
        </p>
      </aside>

      <section className="flex min-w-0 flex-1 justify-center px-4 py-10 sm:px-8 lg:py-16 xl:py-20">
        <div className="w-full max-w-3xl">
          <div className="mb-8 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary lg:hidden">
              Partner onboarding
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-navy sm:text-4xl">
              List your venue
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">
              Create your account and a polished hub profile in one application.
            </p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
