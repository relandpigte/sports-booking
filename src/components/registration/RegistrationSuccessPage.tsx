import Link from "next/link";

import { Logo } from "@/components/Logo";
import { RegistrationSuccessEvent } from "@/components/analytics/RegistrationSuccessEvent";
import type { RegistrationUserType } from "@/lib/registration-tracking";

type RegistrationSuccessContent = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

const CONTENT: Record<RegistrationUserType, RegistrationSuccessContent> = {
  player: {
    eyebrow: "Account created",
    title: "You’re in. Welcome to Bunal.club.",
    description:
      "Your player account is ready. Discover local hubs, find available court time, and book your next game.",
    primaryLabel: "Browse hubs",
    primaryHref: "/hubs",
    secondaryLabel: "Go to player dashboard",
    secondaryHref: "/dashboard/player",
  },
  partner: {
    eyebrow: "Application received",
    title: "Thanks — your venue application is in review.",
    description:
      "Your partner account has been created. We’ll email you after your venue is verified so you can continue setup and publish your hub.",
    primaryLabel: "View partner dashboard",
    primaryHref: "/dashboard/partner",
    secondaryLabel: "Return to Bunal.club",
    secondaryHref: "/",
  },
};

const SPORTS = ["Volleyball", "Badminton", "Pickleball"];

export function RegistrationSuccessPage({
  userType,
  primaryAction,
}: {
  userType: RegistrationUserType;
  primaryAction?: { label: string; href: string };
}) {
  const content = CONTENT[userType];

  return (
    <main className="flex min-h-screen flex-col bg-[#f7faf8] lg:flex-row">
      <RegistrationSuccessEvent userType={userType} />

      <aside className="relative overflow-hidden bg-navy px-6 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[46%] lg:max-w-xl lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative flex flex-col items-center lg:items-start">
          <Link href="/" aria-label="Bunal.club home">
            <Logo size="standard" />
          </Link>

          <div className="mt-10 hidden lg:block">
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white">
              Courts across the Philippines,
              <br />
              <span className="text-accent">booked in seconds.</span>
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
              Find a hub near you, pick the hours you want, and pay the venue
              directly.
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

        <p className="relative mt-10 hidden text-[10px] uppercase tracking-[0.25em] text-white/40 lg:block">
          Play · Compete · Connect
        </p>
      </aside>

      <section className="flex flex-1 items-center justify-center p-4 sm:p-8 lg:p-14">
        <div className="w-full max-w-md rounded-3xl border border-[#dfe7e2] bg-white p-8 text-center shadow-sm shadow-navy/5 sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary ring-4 ring-primary/10">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8"
              aria-hidden="true"
            >
              <path d="m5 12 4 4L19 6" />
            </svg>
          </div>

          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            {content.eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-navy sm:text-3xl">
            {content.title}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-gray-500 sm:text-base">
            {content.description}
          </p>

          <div className="mt-9 space-y-3">
            <Link
              href={primaryAction?.href ?? content.primaryHref}
              className="group flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              {primaryAction?.label ?? content.primaryLabel}
              <span
                aria-hidden="true"
                className="ml-2 transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <Link
              href={content.secondaryHref}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-navy-soft bg-white px-4 text-sm font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              {content.secondaryLabel}
            </Link>
          </div>

          <div className="mt-9 flex items-center justify-center gap-2 border-t border-gray-100 pt-6 text-gray-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <p className="text-xs font-medium">
              A welcome email is on its way to your inbox.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
