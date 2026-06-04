import Link from "next/link";
import { Logo } from "@/components/Logo";

export function PublicTopBar() {
  return (
    <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6">
      <Link href="/hubs" aria-label="Browse hubs">
        <Logo />
      </Link>
      <Link
        href="/login"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Log in
      </Link>
    </header>
  );
}
