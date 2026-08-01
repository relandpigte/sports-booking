import Link from "next/link";
import { Logo } from "@/components/Logo";

// The signed-out header. Sticky, because the hub list is long and "log in" is
// the one thing a visitor is most likely to want halfway down it.
export function PublicTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Bunal.club home" className="min-w-0">
          <Logo className="max-w-[130px] sm:max-w-[220px]" />
        </Link>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/hubs"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-navy sm:block"
          >
            Browse hubs
          </Link>
          <Link
            href="/leaderboard"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-navy md:block"
          >
            Rankings
          </Link>
          <Link
            href="/login"
            className="whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-navy sm:px-3"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover sm:px-3.5"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
