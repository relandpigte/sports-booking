import Link from "next/link";

import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/dal";

// Shared site footer: originally the homepage's own footer, now reused on
// any public page (e.g. the legal pages). Fetches the viewer itself so call
// sites don't need to thread auth state through — getViewer() is request-
// memoized, so this costs nothing extra when a page already called it.
export async function SiteFooter() {
  const viewer = await getViewer();
  const accountHref = viewer ? "/dashboard" : "/login";
  const accountLabel = viewer ? "Dashboard" : "Log in";

  return (
    <footer className="bg-navy px-5 pb-8 pt-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-8 border-b border-white/10 pb-10 md:flex-row md:items-center md:justify-between">
          <Link href="/" aria-label="Bunal.club homepage" className="w-fit">
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
            <Link href="/events" className="hover:text-white">
              Open play events
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
          <p>Philippines</p>
        </div>
      </div>
    </footer>
  );
}
