import { BUNAL_FACEBOOK_URL } from "@/lib/site";

export function FacebookAnnouncementBanner({
  placement,
}: {
  placement: "dashboard" | "homepage";
}) {
  const homepage = placement === "homepage";

  return (
    <aside
      aria-label="Bunal.club Facebook announcement"
      className={`relative overflow-hidden bg-navy text-white ${
        homepage
          ? "border-b border-white/10"
          : "mt-6 rounded-2xl border border-white/10 shadow-lg shadow-navy/10"
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-ocean/20 blur-3xl"
      />
      <CourtLines />

      <div
        className={`relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${
          homepage
            ? "mx-auto max-w-7xl px-5 py-4 sm:px-6 lg:px-8"
            : "p-5 sm:p-6"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3.5 sm:items-center sm:gap-4">
          <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center rounded-full bg-white text-navy shadow-sm shadow-white/20 ${
              homepage ? "h-10 w-10" : "h-12 w-12"
            }`}
          >
            <FacebookIcon className={homepage ? "h-5 w-5" : "h-6 w-6"} />
          </span>

          <div className="min-w-0">
            {homepage && (
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                Bunal.club community
              </p>
            )}
            <h2
              className={`font-black tracking-[-0.02em] ${
                homepage ? "mt-0.5 text-base sm:text-lg" : "text-lg sm:text-xl"
              }`}
            >
              Follow the action on Facebook
            </h2>
            <p
              className={`mt-1 leading-5 text-white/65 ${
                homepage ? "text-xs sm:text-sm" : "text-sm"
              }`}
            >
              News, court updates, event drops, and community highlights—all in
              one feed.
            </p>
          </div>
        </div>

        <a
          href={BUNAL_FACEBOOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-md ${
            homepage
              ? "min-h-10 px-4 text-xs sm:text-sm"
              : "min-h-11 px-5 text-sm"
          }`}
        >
          View &amp; follow
          <ArrowUpRightIcon />
          <span className="sr-only"> on Facebook (opens in a new tab)</span>
        </a>
      </div>
    </aside>
  );
}

function FacebookIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.7 22v-9h3l.45-3.5H13.7V7.25c0-1.02.28-1.71 1.75-1.71h1.87V2.41c-.32-.04-1.43-.13-2.72-.13-2.7 0-4.54 1.64-4.54 4.66V9.5H7v3.5h3.06v9h3.64Z" />
    </svg>
  );
}

function ArrowUpRightIcon() {
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
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}

function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 text-white/[0.06]"
      viewBox="0 0 600 180"
      fill="none"
      preserveAspectRatio="none"
    >
      <path d="M80 0v180M340 0v180M0 90h600" stroke="currentColor" />
      <circle cx="340" cy="90" r="54" stroke="currentColor" />
      <path d="M500 0 390 180M600 24 505 180" stroke="currentColor" />
    </svg>
  );
}
