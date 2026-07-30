import type { ReactNode } from "react";
import Link from "next/link";
import type { PartnerStatus, Role } from "@prisma/client";

import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { logoutAction } from "@/lib/actions";

export type ShellUser = {
  name: string | null;
  playerName: string | null;
  email: string;
  image: string | null;
  role: Role;
  partnerStatus: PartnerStatus | null;
};

// The signed-in chrome: sidebar, nav, account footer.
//
// Lives here rather than only in (app)/layout.tsx because the public hub pages
// need it too — a signed-in visitor browsing /hubs should never lose their way
// back to the dashboard. Those pages pass the viewer when there is one and fall
// back to the public top bar when there isn't.
export function AppShell({
  user,
  children,
  maxWidth = "max-w-5xl",
}: {
  user: ShellUser;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Tinted rather than white, so the sidebar reads as chrome and the page
          beside it reads as content. */}
      <aside className="flex flex-col gap-5 border-b border-gray-200 bg-gray-50/70 p-4 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <Link href="/dashboard" aria-label="Home">
          <Logo size={38} />
        </Link>

        <DashboardNav role={user.role} partnerStatus={user.partnerStatus} />

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-200 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              src={user.image}
              name={user.playerName ?? user.name}
              size={36}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {user.playerName ?? user.name ?? "Player"}
              </p>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Log out"
              aria-label="Log out"
              className="rounded-lg border border-gray-300 p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-8 sm:px-8">
        <div className={`mx-auto w-full ${maxWidth}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
