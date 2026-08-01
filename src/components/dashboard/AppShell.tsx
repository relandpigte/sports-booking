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
  maxWidth = "max-w-6xl",
}: {
  user: ShellUser;
  children: ReactNode;
  maxWidth?: string;
}) {
  const displayName = user.playerName ?? user.name ?? "Player";
  const workspaceLabel =
    user.role === "ADMIN"
      ? "Owner workspace"
      : user.role === "PARTNER"
        ? "Venue workspace"
        : "Player workspace";

  return (
    <div className="flex min-h-screen flex-col bg-[#f7faf8] md:flex-row">
      <aside className="z-40 flex flex-col border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-[272px] md:shrink-0 md:border-b-0 md:bg-navy md:p-4">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-0 md:py-0">
          <Link
            href="/dashboard"
            aria-label="Bunal.club dashboard home"
            className="block w-fit md:p-2.5"
          >
            <Logo />
          </Link>

          <div className="flex items-center gap-2 md:hidden">
            <Avatar src={user.image} name={displayName} size={34} />
            <form action={logoutAction}>
              <button
                type="submit"
                title="Log out"
                aria-label="Log out"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-navy"
              >
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>

        <p className="hidden px-3 pt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35 md:block">
          {workspaceLabel}
        </p>

        <DashboardNav role={user.role} partnerStatus={user.partnerStatus} />

        <div className="mt-auto hidden rounded-2xl border border-white/10 bg-white/5 p-3 md:flex md:items-center md:gap-3">
          <Avatar
            src={user.image}
            name={displayName}
            size={38}
            className="ring-2 ring-white/15"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {displayName}
            </p>
            <p className="truncate text-xs text-white/40">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Log out"
              aria-label="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogoutIcon />
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>
      </main>
    </div>
  );
}

function LogoutIcon() {
  return (
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
  );
}
