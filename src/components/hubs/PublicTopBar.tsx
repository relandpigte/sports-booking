import Link from "next/link";
import { Logo } from "@/components/Logo";

// The public header. Sticky, because discovery pages can be long and the auth
// action — or a signed-in viewer's Dashboard link — should remain close by.
export function PublicTopBar({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Bunal.club home" className="min-w-0">
          <Logo />
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
          {signedIn ? (
            <Link
              href="/dashboard"
              className="whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover sm:px-3.5"
            >
              Dashboard
            </Link>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
