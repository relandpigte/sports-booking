import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/Logo";

const SPORTS = ["Volleyball", "Badminton", "Pickleball"];

// Shared chrome for log in and both registration flows.
//
// Two panels on a wide screen: the brand on the left, the form on the right.
// On a phone the brand panel collapses to a single compact header — a sign-up
// form is long enough without scrolling past a hero to reach it.
export function AuthLayout({
  title,
  subtitle,
  children,
  width = "max-w-md",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  width?: string;
}) {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel — navy, like the shield. */}
      {/* Sticky on desktop: the partner form is long, and the panel scrolling
          away would leave a bare white column beside it. */}
      <div className="relative overflow-hidden bg-navy px-6 py-8 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[46%] lg:max-w-xl lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        {/* Two soft washes of the badge's own colours, so the panel isn't a
            flat block. Purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl"
        />

        <div className="relative">
          <Link href="/" aria-label="Bunal.club home">
            <Logo size="standard" />
          </Link>

          <div className="mt-10 hidden lg:block">
            <h2 className="text-3xl font-extrabold leading-tight text-white">
              Courts across the Philippines,
              <br />
              <span className="text-accent">booked in seconds.</span>
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
              Find a hub near you, pick the hours you want — they don&apos;t
              have to run back to back — and pay the venue directly.
            </p>

            <ul className="mt-8 flex flex-wrap gap-2">
              {SPORTS.map((sport) => (
                <li
                  key={sport}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80"
                >
                  {sport}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative mt-10 hidden text-xs uppercase tracking-[0.2em] text-white/40 lg:block">
          Play · Compete · Connect
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-14">
        <div className={`w-full ${width}`}>
          <h1 className="text-2xl font-bold text-navy sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
