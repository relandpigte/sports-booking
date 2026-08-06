import Link from "next/link";

// Shared closing call-to-action banner: originally the homepage's own
// section, now reused on any public page that wants the same "browse or
// list a venue" nudge (e.g. the legal pages).
export function ClosingCta() {
  return (
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
            Find a nearby hub, choose your court and hours, and complete your
            booking securely with QR Ph.
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
  );
}
