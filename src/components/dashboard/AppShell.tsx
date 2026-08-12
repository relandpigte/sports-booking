import type { ReactNode } from "react";
import Link from "next/link";
import type { PartnerStatus, Role } from "@prisma/client";

import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { MobileDashboardMenu } from "@/components/dashboard/MobileDashboardMenu";
import { logoutAction } from "@/lib/actions";
import { stopPartnerImpersonationAction } from "@/lib/impersonation-actions";

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
  impersonation,
  hasMessages = false,
}: {
  user: ShellUser;
  children: ReactNode;
  maxWidth?: string;
  impersonation?: {
    partnerName: string;
    adminName: string;
    expiresAt: Date;
  } | null;
  hasMessages?: boolean;
}) {
  const displayName = user.playerName ?? user.name ?? "Player";
  const workspaceLabel =
    impersonation
      ? "Assisted partner workspace"
      : user.role === "ADMIN"
      ? "Owner workspace"
      : user.role === "PARTNER"
        ? "Venue workspace"
        : "Player workspace";

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-clip bg-[#f7faf8] md:flex-row">
      <header className="sticky top-0 z-40 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <MobileDashboardMenu
            role={user.role}
            partnerStatus={impersonation ? "ACTIVE" : user.partnerStatus}
            displayName={displayName}
            email={user.email}
            image={user.image}
            workspaceLabel={workspaceLabel}
            hasMessages={hasMessages}
          />
          <Link
            href="/dashboard"
            aria-label="Bunal.club dashboard home"
            className="block w-fit"
          >
            <Logo />
          </Link>
        </div>
        <Avatar src={user.image} name={displayName} size={38} />
      </header>

      <aside className="z-40 hidden flex-col bg-navy p-4 md:sticky md:top-0 md:flex md:h-screen md:w-[272px] md:shrink-0">
        <div>
          <Link
            href="/dashboard"
            aria-label="Bunal.club dashboard home"
            className="block w-fit p-2.5"
          >
            <Logo />
          </Link>
        </div>

        <p className="px-3 pt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
          {workspaceLabel}
        </p>

        <DashboardNav
          role={user.role}
          partnerStatus={impersonation ? "ACTIVE" : user.partnerStatus}
          hasMessages={hasMessages}
        />

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

      <main
        className="min-w-0 flex-1 px-4 pb-8 pt-6 sm:px-6 md:px-8 md:py-10"
      >
        <div className={`mx-auto w-full ${maxWidth}`}>
          {impersonation && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-950">
                  Acting as {impersonation.partnerName}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-amber-800">
                  Signed in as {impersonation.adminName}. Account credentials,
                  payment connections, and settlement payments remain blocked.
                  Session ends at {formatImpersonationExpiry(impersonation.expiresAt)}.
                </p>
              </div>
              <form action={stopPartnerImpersonationAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-900 px-4 text-sm font-bold text-white transition-colors hover:bg-amber-950"
                >
                  Exit assistance
                </button>
              </form>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

function formatImpersonationExpiry(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(value);
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
