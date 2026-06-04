import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logoutAction } from "@/lib/actions";

export function AdminHeader({ email }: { email?: string | null }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
      <Link href="/admin" aria-label="Admin home">
        <Logo />
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {email && (
          <span className="hidden text-gray-500 sm:inline">{email}</span>
        )}
        <Link
          href="/dashboard"
          className="font-medium text-primary hover:underline"
        >
          My dashboard
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
