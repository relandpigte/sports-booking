import Link from "next/link";
import type { ReactNode } from "react";

import { ClosingCta } from "@/components/ClosingCta";
import { FacebookAnnouncementBanner } from "@/components/FacebookAnnouncementBanner";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { PublicInstallBanner } from "@/components/pwa/PublicInstallBanner";
import { BOOKING_HOLD_MINUTES } from "@/lib/constants";

type IconName =
  | "calendar"
  | "card"
  | "chart"
  | "check"
  | "clock"
  | "court"
  | "map"
  | "message"
  | "phone"
  | "shield"
  | "users";

const FEATURES: {
  icon: IconName;
  title: string;
  description: string;
}[] = [
  {
    icon: "map",
    title: "Hub discovery & maps",
    description:
      "Browse venue profiles, offered sports, court details, contact information, and map locations.",
  },
  {
    icon: "clock",
    title: "Live court availability",
    description:
      "See bookable hours as they change and select the time blocks that fit your game.",
  },
  {
    icon: "calendar",
    title: "Flexible bookings",
    description:
      "Reserve one hour or several. Separate time blocks can be handled in one checkout.",
  },
  {
    icon: "phone",
    title: "Player booking dashboard",
    description:
      "Keep upcoming bookings, payment status, rescheduling, and cancellations in one place.",
  },
  {
    icon: "court",
    title: "Venue operations",
    description:
      "Partners manage hubs, courts, rates, operating hours, cover photos, and booking activity.",
  },
  {
    icon: "chart",
    title: "Reports that reconcile",
    description:
      "Venue partners see collected revenue and booking performance in one clear workspace.",
  },
  {
    icon: "shield",
    title: "Protected payments",
    description:
      "Secure PayMongo checkout, automatic verification, and duplicate-charge protection make every booking easier.",
  },
  {
    icon: "message",
    title: "Booking-scoped messaging",
    description:
      "Confirmed court bookings create private player–venue conversations, while confirmed event registrations open group discussions.",
  },
];

const TEAM_PERMISSION_LEVELS = ["None", "View", "Manage"] as const;

const TEAM_PERMISSION_ROWS: {
  module: string;
  selected: (typeof TEAM_PERMISSION_LEVELS)[number];
  manageAvailable?: boolean;
}[] = [
  { module: "Hubs", selected: "View" },
  { module: "Bookings", selected: "Manage" },
  { module: "Events", selected: "Manage" },
  { module: "Reports", selected: "View", manageAvailable: false },
  { module: "Messages", selected: "Manage" },
  { module: "Payments", selected: "None" },
];

const FAQS = [
  {
    question: "Does Bunal.club charge partners a monthly fee?",
    answer:
      "No. There are no plans, subscriptions, or monthly charges. Automatic PayMongo bookings use a 3% service fee; manual venue payments are fee-free.",
  },
  {
    question: "How much is the booking service fee?",
    answer:
      "The Bunal.club service fee is 3% for automatic PayMongo checkout. Partner-reviewed manual payments have no Bunal service fee.",
  },
  {
    question: "Where does the player's court payment go?",
    answer:
      "The venue connects its own PayMongo account, so the booking proceeds are deposited to that partner. The venue retains its advertised court rate.",
  },
  {
    question: "Which payment methods can players use?",
    answer:
      "Venues can use automatic PayMongo QR Ph checkout or partner-reviewed manual GCash, Maya, bank-transfer, and custom payment networks.",
  },
];

const PAYMENT_METHODS = [
  {
    name: "QR Ph",
    detail: "The only online payment method",
    mark: "QR",
    markClassName: "bg-accent-soft text-primary",
  },
];

const PAYMONGO_PROCESSING_RATES = [
  { method: "QR Ph online", rate: "1.34%" },
];

const QR_PH_APPS = [
  "BDO Pay",
  "BPI",
  "Metrobank",
  "UnionBank",
  "LANDBANK",
  "RCBC",
  "GoTyme",
  "SeaBank",
];

function Icon({
  name,
  className = "h-6 w-6",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    calendar: (
      <>
        <path d="M8 2v4M16 2v4M3 9h18" />
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="m8 14 2 2 5-5" />
      </>
    ),
    card: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h3" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        <path d="m4 8 6-5 6 8 5-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    court: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 3v18M3 12h18M7 3v6M17 15v6" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" />
        <path d="M8 3v15M16 6v15" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 5h4M11 18h2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-navy sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
        {description}
      </p>
    </div>
  );
}

function BookingPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:mr-0">
      <div
        aria-hidden="true"
        className="absolute -inset-8 rounded-full bg-ocean/15 blur-3xl"
      />
      <div className="relative rotate-[1deg] rounded-[28px] border border-white/15 bg-white p-3 shadow-2xl shadow-black/25 sm:p-4">
        <div className="rounded-[22px] border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ocean">
                Sample booking
              </p>
              <h3 className="mt-1 text-lg font-bold text-navy">
                Your chosen sports hub
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pickleball · Covered court
              </p>
            </div>
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
              Live
            </span>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Date</p>
                <p className="mt-0.5 text-sm font-bold text-navy">
                  Choose your game day
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-soft text-ocean">
                <Icon name="calendar" className="h-5 w-5" />
              </span>
            </div>

            <p className="mt-4 text-xs font-medium text-slate-500">
              Available hours
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-bold">
              <span className="rounded-lg bg-primary px-2 py-2.5 text-white">
                6:00 PM
              </span>
              <span className="rounded-lg bg-primary px-2 py-2.5 text-white">
                7:00 PM
              </span>
              <span className="rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-slate-500">
                8:00 PM
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-100 pt-5">
            <div>
              <p className="text-xs text-slate-500">Service fee</p>
              <p className="mt-0.5 text-sm font-bold text-navy">3%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Pay securely with</p>
              <p className="mt-0.5 text-sm font-bold text-primary">
                PayMongo checkout
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative -mt-5 ml-auto mr-3 flex w-fit items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-black/10 sm:mr-[-20px]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-primary">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs text-slate-500">Payment verified</p>
          <p className="text-sm font-bold text-navy">Booking confirmed</p>
        </div>
      </div>
    </div>
  );
}

export function HomePage({ isLoggedIn }: { isLoggedIn: boolean }) {
  const accountHref = isLoggedIn ? "/dashboard" : "/login";
  const accountLabel = isLoggedIn ? "Dashboard" : "Log in";

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-foreground">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="Bunal.club homepage"
            className="min-w-0"
          >
            <Logo />
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-1 lg:flex"
          >
            {[
              ["How it works", "#how-it-works"],
              ["Payments", "#payments"],
              ["Features", "#features"],
              ["Teams", "#teams"],
              ["Events", "/events"],
              ["Rankings", "/leaderboard"],
              ["For partners", "#partners"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-primary-soft hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/events"
              className="inline-flex rounded-xl px-2.5 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-primary-soft hover:text-primary lg:hidden"
            >
              Events
            </Link>
            <Link
              href={accountHref}
              className="hidden rounded-xl px-3 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-slate-50 sm:inline-flex"
            >
              {accountLabel}
            </Link>
            <Link
              href="/hubs"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Browse courts
            </Link>
          </div>
        </div>
      </header>

      <main>
        <FacebookAnnouncementBanner placement="homepage" />

        <section className="relative overflow-hidden bg-navy">
          <div
            aria-hidden="true"
            className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-primary/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-ocean/20 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.03fr_0.97fr] lg:px-8 lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.17em] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Made for the Philippine court community
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-[64px]">
                Find your court.
                <span className="block text-accent">Pay. Play. Done.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
                Discover local hubs, choose live available hours, and complete
                your booking through secure PayMongo checkout—without the
                back-and-forth.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/hubs"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-black/15 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
                >
                  Find a court
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/register/partner"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 bg-white/5 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
                >
                  List your venue
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/65">
                {[
                  "No monthly partner fee",
                  "Live availability",
                  "Secure PayMongo QR Ph",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Icon name="check" className="h-4 w-4 text-accent" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <BookingPreview />
          </div>
        </section>

        <section aria-label="Core benefits" className="border-b border-slate-200">
          <div className="mx-auto grid max-w-7xl divide-y divide-slate-200 px-5 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-6 lg:grid-cols-4 lg:px-8">
            {[
              {
                icon: "clock" as const,
                title: "Live availability",
                copy: "Choose open hours confidently.",
              },
              {
                icon: "calendar" as const,
                title: "Flexible selection",
                copy: "Book one or several hours.",
              },
              {
                icon: "card" as const,
                title: "Easy payments",
                copy: "Secure QR Ph checkout.",
              },
              {
                icon: "check" as const,
                title: "Fast confirmation",
                copy: "Automatic payment verification.",
              },
            ].map((benefit) => (
              <div
                key={benefit.title}
                className="flex items-center gap-3 py-6 sm:px-5 lg:px-6"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ocean-soft text-ocean">
                  <Icon name={benefit.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-navy">
                    {benefit.title}
                  </h2>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {benefit.copy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="relative scroll-mt-24 overflow-hidden bg-primary-soft px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full border border-primary/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-primary/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary/5"
          />

          <div className="relative mx-auto max-w-7xl">
            <div className="overflow-hidden rounded-[32px] border border-primary/15 bg-white shadow-xl shadow-navy/5">
              <div className="border-b border-slate-200 px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  How Bunal.club works
                </p>
                <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
                  <h2 className="max-w-2xl text-3xl font-black tracking-[-0.04em] text-navy sm:text-4xl lg:text-5xl">
                    Book your court. Pay the venue directly.
                  </h2>
                  <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                    Bunal.club keeps discovery, live availability, payment
                    verification, and confirmation together without holding
                    the venue&apos;s court revenue.
                  </p>
                </div>
              </div>

              <div className="px-6 py-9 sm:px-10 sm:py-11 lg:px-12 lg:py-12">
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="absolute left-[8.333%] right-[8.333%] top-9 hidden h-px bg-slate-200 md:block"
                  />
                  <div className="grid gap-0 md:grid-cols-3 md:gap-8">
                    {[
                      {
                        number: "1",
                        title: "Browse nearby hubs",
                        copy: "Compare venue profiles, sports, court details, maps, and live availability.",
                        icon: "map" as const,
                        iconClassName: "bg-ocean-soft text-ocean",
                        numberClassName: "bg-navy ring-slate-200",
                        emphasized: false,
                      },
                      {
                        number: "2",
                        title: "Pick your court and hours",
                        copy: `Choose a game day and one or several open time blocks. Checkout holds them for ${BOOKING_HOLD_MINUTES} minutes.`,
                        icon: "calendar" as const,
                        iconClassName: "bg-primary-soft text-primary",
                        numberClassName: "bg-ocean ring-ocean/20",
                        emphasized: false,
                      },
                      {
                        number: "3",
                        title: "Pay the venue directly",
                        copy: "Pay the venue owner’s connected PayMongo account or listed manual payment account. Your booking is confirmed after verification.",
                        icon: "check" as const,
                        iconClassName: "bg-accent-soft text-primary",
                        numberClassName: "bg-primary ring-primary/20",
                        emphasized: true,
                      },
                    ].map((step, index) => (
                      <article
                        key={step.number}
                        className={`relative flex gap-5 pb-9 md:block md:pb-0 ${
                          step.emphasized
                            ? "rounded-2xl bg-primary-soft/60 px-4 pt-4 md:-mx-4 md:-mt-4 md:pb-5"
                            : ""
                        }`}
                      >
                        {index < 2 && (
                          <div
                            aria-hidden="true"
                            className="absolute bottom-0 left-9 top-[72px] w-px bg-slate-200 md:hidden"
                          />
                        )}
                        <div
                          className={`relative z-10 flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-4 border-white text-2xl font-black text-white shadow-sm ring-1 ${step.numberClassName}`}
                        >
                          {step.number}
                        </div>
                        <div className="pt-1 md:pt-0">
                          <span
                            className={`flex h-11 w-11 items-center justify-center rounded-xl md:mt-7 ${step.iconClassName}`}
                          >
                            <Icon name={step.icon} className="h-5 w-5" />
                          </span>
                          <h3 className="mt-4 text-xl font-black tracking-[-0.02em] text-navy">
                            {step.title}
                          </h3>
                          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
                            {step.copy}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <aside className="mt-10 overflow-hidden rounded-3xl bg-navy text-white shadow-xl shadow-navy/10">
                  <div className="grid gap-7 px-6 py-7 sm:px-8 sm:py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-10">
                    <div>
                      <span className="inline-flex rounded-full bg-accent px-3 py-1.5 text-xs font-black text-navy">
                        Direct to venue
                      </span>
                      <h3 className="mt-4 text-xl font-black tracking-[-0.02em] text-white sm:text-2xl">
                        Your court payment goes to the venue owner.
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                        Bunal.club does not hold the venue&apos;s court revenue.
                        Automatic PayMongo checkout shows our separate 3% fee;
                        manual venue payments have no Bunal fee.
                      </p>
                    </div>

                    <div
                      aria-label="Payment moves from the player to the venue owner"
                      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="text-center">
                        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
                          <Icon name="users" className="h-5 w-5" />
                        </span>
                        <p className="mt-2 text-xs font-bold text-white/65">
                          Player pays
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="text-2xl font-black text-accent"
                      >
                        →
                      </span>
                      <div className="text-center">
                        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-navy">
                          <Icon name="court" className="h-5 w-5" />
                        </span>
                        <p className="mt-2 text-xs font-bold text-white">
                          Venue receives
                        </p>
                      </div>
                    </div>
                  </div>
                </aside>

                <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-7 sm:flex-row sm:items-center">
                  <Link
                    href="/hubs"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
                  >
                    Browse courts
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link
                    href="/register/partner"
                    className="inline-flex min-h-12 items-center justify-center px-4 py-3 text-sm font-bold text-navy transition-colors hover:text-primary"
                  >
                    List your venue
                    <span aria-hidden="true" className="ml-1">
                      ↗
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="payments"
          className="scroll-mt-24 bg-slate-50 px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
                Payment gateway
              </p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-navy sm:text-5xl">
                Pay securely. Get confirmed in seconds.
              </h2>
              <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
                Scan PayMongo&apos;s exact-amount QR Ph code directly on your
                booking. Bunal.club verifies successful payment automatically
                and confirms it without receipt screenshots or manual follow-up.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: "check" as const,
                  label: "Automatic verification",
                  copy: "Signed payment updates remove the need to send a receipt screenshot.",
                },
                {
                  icon: "calendar" as const,
                  label: "Fast confirmation",
                  copy: "Successful payment confirms the held booking automatically.",
                },
                {
                  icon: "shield" as const,
                  label: "Secure dynamic QR",
                  copy: "PayMongo generates the single-use QR; payment details never pass through Bunal.club.",
                },
              ].map((item) => (
                <article
                  key={item.label}
                  className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-navy/5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-navy">{item.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {item.copy}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-ocean">
                      Pay with
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-navy">
                      One checkout. QR Ph only.
                    </h3>
                  </div>
                  <p className="max-w-xs text-sm leading-6 text-slate-500">
                    Scan with a participating Philippine banking or e-wallet
                    app.
                  </p>
                </div>

                <div className="mt-6 grid gap-3">
                  {PAYMENT_METHODS.map((method) => (
                    <div
                      key={method.name}
                      className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center"
                    >
                      <span
                        className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-2 text-sm font-black ${method.markClassName}`}
                      >
                        {method.mark}
                      </span>
                      <p className="mt-3 text-sm font-black text-navy">
                        {method.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {method.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-xs font-black text-primary">
                    QR
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                      QR Ph
                    </p>
                    <h3 className="font-black text-navy">
                      Scan from your preferred app
                    </h3>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  One dynamic QR can be paid through participating Philippine
                  banking and e-wallet apps.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {QR_PH_APPS.map((app) => (
                    <span
                      key={app}
                      className="rounded-lg border border-slate-200 bg-navy-soft px-2.5 py-1.5 text-[11px] font-extrabold text-navy"
                    >
                      {app}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-400">
                  App availability is determined by PayMongo and each
                  participating institution.
                </p>
              </aside>
            </div>

            <div className="relative mt-12 overflow-hidden rounded-[32px] bg-navy p-6 shadow-2xl shadow-navy/15 sm:p-10 lg:p-12">
              <div
                aria-hidden="true"
                className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
              />
              <div className="relative grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
                    For venue partners
                  </p>
                  <h3 className="mt-3 text-3xl font-black tracking-[-0.035em] text-white">
                    Booking proceeds go straight to your connected PayMongo
                    account.
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
                    Bunal.club does not hold your court revenue. You receive the
                    booking subtotal in your own PayMongo account, keep your
                    advertised court rate, and see the fixed Bunal.club service
                    fee clearly for later settlement.
                  </p>
                </div>

                <ol className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      number: "01",
                      title: "Player pays",
                      copy: "Court rate and service fee appear in one checkout.",
                    },
                    {
                      number: "02",
                      title: "PayMongo verifies",
                      copy: "The signed payment update confirms the booking.",
                    },
                    {
                      number: "03",
                      title: "You receive it",
                      copy: "The booking subtotal lands in your PayMongo account.",
                    },
                  ].map((step) => (
                    <li
                      key={step.number}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-black text-navy">
                        {step.number}
                      </span>
                      <h4 className="mt-4 font-extrabold text-white">
                        {step.title}
                      </h4>
                      <p className="mt-2 text-xs leading-5 text-white/55">
                        {step.copy}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-6 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row">
              <p className="inline-flex items-center gap-2">
                <Icon name="clock" className="h-4 w-4 text-primary" />
                Selected hours are held for {BOOKING_HOLD_MINUTES} minutes
                while checkout is open.
              </p>
              <p className="inline-flex items-center gap-2">
                <Icon name="card" className="h-4 w-4 text-primary" />
                PayMongo&apos;s QR Ph processing fee is shown before you pay —{" "}
                <a href="#partners" className="font-bold text-primary hover:underline">
                  see current rates
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="One connected platform"
              title="Useful before, during, and after every booking."
              description="The public directory, booking flow, venue workspace, and partner reports use the same source of truth."
            />

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-navy/5"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon name={feature.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-extrabold text-navy">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="teams"
          className="scroll-mt-24 border-t border-slate-100 px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="Partner teams"
                title="Run your hub with a team."
                description="Invite player accounts as staff by email and decide exactly where each person can view information or help manage your venue."
              />

              <ul className="mt-8 space-y-4">
                {[
                  {
                    icon: "users" as const,
                    title: "Configurable module access",
                    copy: "Set None, View, or Manage access for hubs, bookings, events, messages, and payments. Reports stay read-only.",
                  },
                  {
                    icon: "chart" as const,
                    title: "Activity and operational updates",
                    copy: "Review staff activity and keep the owner and relevant managers informed about booking operations.",
                  },
                  {
                    icon: "shield" as const,
                    title: "Owner-only protection",
                    copy: "Team administration, whole-hub creation or deletion, and settlements remain with the owner.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon name={item.icon} className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold text-navy">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {item.copy}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                <span className="font-extrabold text-navy">Staff experience:</span>{" "}
                invited players keep their personal court and event booking
                workspace, then switch into the staff workspace when they need
                to help the venue.
              </div>

              <Link
                href="/register/partner"
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                Start your team
              </Link>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl shadow-navy/5 sm:p-6">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                    Staff access example
                  </p>
                  <h3 className="mt-1 text-xl font-black text-navy">
                    Hub coordinator
                  </h3>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon name="shield" className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-5" role="table" aria-label="Example staff module permissions">
                <div
                  role="row"
                  className="grid grid-cols-[minmax(72px,1fr)_40px_40px_52px] items-center gap-2 px-2 sm:grid-cols-[minmax(120px,1fr)_56px_56px_64px]"
                >
                  <span role="columnheader" className="text-xs font-extrabold text-navy">
                    Module
                  </span>
                  {TEAM_PERMISSION_LEVELS.map((level) => (
                    <span
                      key={level}
                      role="columnheader"
                      className="text-center text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 sm:text-[10px]"
                    >
                      {level}
                    </span>
                  ))}
                </div>

                <div role="rowgroup" className="mt-2 space-y-2">
                  {TEAM_PERMISSION_ROWS.map((row) => (
                    <div
                      key={row.module}
                      role="row"
                      className={`grid grid-cols-[minmax(72px,1fr)_40px_40px_52px] items-center gap-2 rounded-xl px-2 py-3 sm:grid-cols-[minmax(120px,1fr)_56px_56px_64px] sm:px-3 ${
                        row.selected === "Manage"
                          ? "border border-primary/20 bg-primary-soft"
                          : "bg-slate-50"
                      }`}
                    >
                      <span
                        role="rowheader"
                        className={`truncate text-xs font-bold sm:text-sm ${
                          row.selected === "Manage" ? "text-primary" : "text-navy"
                        }`}
                      >
                        {row.module}
                      </span>
                      {TEAM_PERMISSION_LEVELS.map((level) => {
                        const unavailable =
                          level === "Manage" && row.manageAvailable === false;
                        const selected = row.selected === level;
                        return (
                          <span
                            key={level}
                            role="cell"
                            aria-label={`${row.module}: ${level}${
                              unavailable
                                ? " unavailable"
                                : selected
                                  ? " selected"
                                  : " not selected"
                            }`}
                            className="flex justify-center"
                          >
                            <span
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 rounded-full ${
                                unavailable
                                  ? "bg-slate-200"
                                  : selected
                                    ? "bg-primary ring-2 ring-white outline outline-2 outline-primary"
                                    : "border border-slate-300 bg-white"
                              }`}
                            />
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-ocean/20 bg-ocean-soft p-3 text-ocean">
                <Icon name="message" className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs font-bold leading-5">
                  Messages View can read conversations. Messages Manage can
                  also reply to players and event participants.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="partners"
          className="scroll-mt-24 bg-primary-soft px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.95fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="For venue partners"
                title="Your courts. Your PayMongo. Your court revenue."
                description="Create polished hub profiles, publish bookable courts, and receive player booking proceeds through your own connected PayMongo account."
              />

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  "No plan or subscription",
                  "No monthly platform charge",
                  "Publish a Coming soon hub before PayMongo",
                  "Reports and booking breakdown",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-xl bg-white/75 px-4 py-3 text-sm font-bold text-navy"
                  >
                    <Icon name="check" className="h-4 w-4 text-primary" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register/partner"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-navy px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-navy-hover"
                >
                  Register your venue
                </Link>
                <Link
                  href={accountHref}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-navy/15 bg-white px-6 py-3 text-sm font-bold text-navy transition-colors hover:border-navy/30"
                >
                  {isLoggedIn ? "Open dashboard" : "Partner log in"}
                </Link>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-primary/15 bg-white shadow-xl shadow-primary/10">
              <div className="border-b border-slate-100 p-6 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Simple partner economics
                </p>
                <h3 className="mt-2 text-2xl font-black text-navy">
                  Keep your advertised court rate.
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Player booking proceeds go to your PayMongo account.
                  Bunal.club&apos;s 3% service fee is recorded clearly for
                  settlement.
                </p>
              </div>

              <div className="grid gap-7 p-6 sm:p-7 xl:grid-cols-[0.72fr_1.28fr]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    Bunal.club fee
                  </p>
                  <p className="mt-3 text-4xl font-black text-primary">3%</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    of the court booking total
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean">
                    PayMongo processing
                  </p>
                  <dl className="mt-4 space-y-2.5">
                    {PAYMONGO_PROCESSING_RATES.map((item) => (
                      <div
                        key={item.method}
                        className="flex items-start justify-between gap-4 text-xs"
                      >
                        <dt className="leading-5 text-slate-600">
                          {item.method}
                        </dt>
                        <dd className="shrink-0 text-right font-black leading-5 text-navy">
                          {item.rate}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <p className="text-[11px] leading-5 text-slate-400 xl:col-span-2">
                  PayMongo&apos;s published standard rates are exclusive of VAT
                  and may change. Connected-account or custom pricing can
                  differ. Processing charges are separate from Bunal.club&apos;s
                  service fee.{" "}
                  <a
                    href="https://www.paymongo.com/pricing"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-ocean hover:underline"
                  >
                    View current PayMongo pricing ↗
                  </a>
                </p>
              </div>

              <div className="flex items-center gap-3 bg-navy px-6 py-5 text-white sm:px-7">
                <Icon name="chart" className="h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm text-white/75">
                  Payment, revenue, and booking breakdowns stay visible in the
                  partner workspace.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
              {[
                {
                  eyebrow: "Players",
                  title: "Book with confidence",
                  copy: "Browse hubs, see live hours, pay online, and manage your upcoming games.",
                  href: "/register",
                  cta: "Create player account",
                  icon: "users" as const,
                },
                {
                  eyebrow: "Partners",
                  title: "Run your venue clearly",
                  copy: "Manage courts, bookings, PayMongo connection, reports, and service fees.",
                  href: "/register/partner",
                  cta: "Apply as partner",
                  icon: "court" as const,
                },
              ].map((role) => (
                <article
                  key={role.eyebrow}
                  className="rounded-3xl border border-slate-200 p-6 sm:p-7"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ocean-soft text-ocean">
                    <Icon name={role.icon} />
                  </span>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                    {role.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-black text-navy">
                    {role.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {role.copy}
                  </p>
                  <Link
                    href={role.href}
                    className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-hover"
                  >
                    {role.cta}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-50 px-5 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <SectionHeading
              eyebrow="Questions"
              title="Clear answers before you book."
              description="The important payment and partner details, without the fine-print feeling."
            />

            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="text-xl text-primary transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pt-3 text-sm leading-6 text-slate-600">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <ClosingCta />
      </main>

      <SiteFooter />
      <PublicInstallBanner />
    </div>
  );
}
