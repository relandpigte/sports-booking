import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

type IconName =
  | "calendar"
  | "card"
  | "chart"
  | "check"
  | "clock"
  | "court"
  | "map"
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
];

const FAQS = [
  {
    question: "Does Bunal.club charge partners a monthly fee?",
    answer:
      "No. There are no plans, subscriptions, or monthly charges. Bunal.club uses a 3% service fee per paid booking.",
  },
  {
    question: "How much is the booking service fee?",
    answer:
      "The Bunal.club service fee is 3% of the court booking total.",
  },
  {
    question: "Where does the player's court payment go?",
    answer:
      "The venue connects its own PayMongo account, so the booking proceeds are deposited to that partner. The venue retains its advertised court rate.",
  },
  {
    question: "Which payment methods can players use?",
    answer:
      "PayMongo's hosted checkout supports QR Ph, GCash, Maya, and credit or debit cards when those channels are enabled for the venue's account.",
  },
];

const PAYMENT_METHODS = [
  {
    name: "GCash",
    detail: "E-wallet",
    mark: "G",
    markClassName: "bg-ocean-soft text-ocean",
  },
  {
    name: "Maya",
    detail: "E-wallet",
    mark: "M",
    markClassName: "bg-primary-soft text-primary",
  },
  {
    name: "QR Ph",
    detail: "Scan to pay",
    mark: "QR",
    markClassName: "bg-accent-soft text-primary",
  },
  {
    name: "Visa · Mastercard",
    detail: "Credit or debit card",
    mark: "••••",
    markClassName: "bg-navy-soft text-navy",
  },
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
                Your chosen Bohol hub
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
                Made for Bohol&apos;s court community
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
                  "Secure hosted checkout",
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
                copy: "QR Ph, GCash, Maya, or card.",
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
          className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="For players"
              title="From “tara, laro” to a confirmed court."
              description="No Messenger thread, no uncertain slot, no separate payment proof. Bunal.club keeps the whole booking journey clear."
            />

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {[
                {
                  number: "01",
                  title: "Browse a hub",
                  copy: "Find volleyball, badminton, pickleball, and tennis courts in the public directory.",
                  icon: "map" as const,
                },
                {
                  number: "02",
                  title: "Pick your hours",
                  copy: "Choose a court, game day, and live available time blocks. Your paid checkout holds them for 15 minutes.",
                  icon: "calendar" as const,
                },
                {
                  number: "03",
                  title: "Pay and play",
                  copy: "Finish on PayMongo's hosted checkout. Once payment is verified, your booking is confirmed automatically.",
                  icon: "check" as const,
                },
              ].map((step) => (
                <article
                  key={step.number}
                  className="group relative rounded-3xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-navy/5 sm:p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black tracking-[0.16em] text-primary">
                      {step.number}
                    </span>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                      <Icon name={step.icon} />
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-black text-navy">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {step.copy}
                  </p>
                </article>
              ))}
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
                Choose a familiar payment method on PayMongo&apos;s hosted
                checkout. Bunal.club verifies successful payment automatically
                and confirms your booking without receipt screenshots or manual
                follow-up.
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
                  label: "Secure hosted checkout",
                  copy: "Payment and card details are handled by PayMongo, not Bunal.club.",
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
                      One checkout. Familiar options.
                    </h3>
                  </div>
                  <p className="max-w-xs text-sm leading-6 text-slate-500">
                    Available channels depend on the venue&apos;s activated
                    PayMongo account.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                Selected hours are held for 15 minutes while checkout is open.
              </p>
              <p className="inline-flex items-center gap-2">
                <Icon name="card" className="h-4 w-4 text-primary" />
                Processing fees may be added by PayMongo at checkout.
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

              <div className="p-6 sm:p-7">
                <p className="text-sm font-medium text-slate-500">
                  Every paid booking
                </p>
                <p className="mt-2 text-4xl font-black text-primary">3%</p>
                <p className="mt-1 text-xs text-slate-500">
                  of the court booking total
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

        <section className="px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-navy px-6 py-12 sm:px-10 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl"
            />
            <div className="relative max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
                Play · Compete · Connect
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">
                Your next game is a few taps away.
              </h2>
              <p className="mt-4 text-base leading-7 text-white/65">
                Find a Bohol hub, choose your court and hours, and complete your
                booking with the payment method that works for you.
              </p>
            </div>
            <div className="relative mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0">
              <Link
                href="/hubs"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                Browse courts
              </Link>
              <Link
                href="/register/partner"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                List a venue
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-navy px-5 pb-8 pt-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-8 border-b border-white/10 pb-10 md:flex-row md:items-center md:justify-between">
            <Link
              href="/"
              aria-label="Bunal.club homepage"
              className="w-fit"
            >
              <Logo size="standard" />
            </Link>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/65"
            >
              <Link href="/hubs" className="hover:text-white">
                Browse hubs
              </Link>
              <Link href="/leaderboard" className="hover:text-white">
                Player rankings
              </Link>
              <Link href="/register" className="hover:text-white">
                Player signup
              </Link>
              <Link href="/register/partner" className="hover:text-white">
                Partner signup
              </Link>
              <Link href={accountHref} className="hover:text-white">
                {accountLabel}
              </Link>
              <Link href="/terms" className="hover:text-white">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white">
                Privacy
              </Link>
            </nav>
          </div>
          <div className="flex flex-col gap-2 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Bunal.club. All rights reserved.</p>
            <p>Bohol, Philippines</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
