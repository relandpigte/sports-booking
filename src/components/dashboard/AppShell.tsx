import type { ReactNode } from "react";
import Link from "next/link";
import type { PartnerStatus, Role } from "@prisma/client";

import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { MobileDashboardMenu } from "@/components/dashboard/MobileDashboardMenu";
import { ReservationHoldDock } from "@/components/bookings/ReservationHoldDock";
import { stopPartnerImpersonationAction } from "@/lib/impersonation-actions";
import {
  enterPersonalWorkspaceAction,
  enterStaffWorkspaceAction,
} from "@/lib/staffing-actions";
import type { PartnerWorkspace } from "@/lib/staffing";
import type { BookingHoldView } from "@/lib/booking-payments";

export type ShellUser = {
  name: string | null;
  playerName: string | null;
  email: string;
  image: string | null;
  role: Role;
  partnerStatus: PartnerStatus | null;
};

// The signed-in chrome: responsive navigation, account menu, and app content.
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
  workspace,
  staffWorkspaceAvailable = false,
  activeBookingHold = null,
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
  workspace?: PartnerWorkspace | null;
  staffWorkspaceAvailable?: boolean;
  activeBookingHold?: BookingHoldView | null;
}) {
  const displayName = user.playerName ?? user.name ?? "Player";
  const workspaceLabel =
    impersonation
      ? "Assisted partner workspace"
      : user.role === "ADMIN"
      ? "Owner workspace"
      : workspace?.kind === "STAFF"
        ? `${workspace.partnerName} workspace`
      : user.role === "PARTNER"
        ? "Venue workspace"
        : "Player workspace";

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-clip bg-[#f7faf8]">
      <header className="sticky top-0 z-40 flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <MobileDashboardMenu
            role={user.role}
            partnerStatus={impersonation ? "ACTIVE" : user.partnerStatus}
            displayName={displayName}
            email={user.email}
            image={user.image}
            workspaceLabel={workspaceLabel}
            hasMessages={hasMessages}
            workspace={workspace}
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

      <DashboardNav
        role={user.role}
        partnerStatus={impersonation ? "ACTIVE" : user.partnerStatus}
        displayName={displayName}
        email={user.email}
        image={user.image}
        workspaceLabel={workspaceLabel}
        hasMessages={hasMessages}
        workspace={workspace}
      />

      <main
        className="min-w-0 flex-1 px-4 pb-8 pt-6 sm:px-6 md:px-8 md:py-10"
      >
        <div className={`dashboard-content mx-auto w-full ${maxWidth}`}>
          {impersonation && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-950">
                  Acting as {impersonation.partnerName}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-amber-800">
                  Signed in as {impersonation.adminName}. Partner content and
                  payment configuration edits are audited. Password, MFA,
                  sessions, and settlement payments remain protected. Session
                  ends at {formatImpersonationExpiry(impersonation.expiresAt)}.
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
          {!impersonation && workspace?.kind === "STAFF" && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-navy">
                  Working with {workspace.partnerName}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Your navigation and actions follow the access assigned by the partner owner.
                </p>
              </div>
              <form action={enterPersonalWorkspaceAction}>
                <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary/30 bg-white px-4 text-sm font-bold text-primary">
                  Switch to player workspace
                </button>
              </form>
            </div>
          )}
          {!impersonation &&
            !workspace &&
            staffWorkspaceAvailable &&
            user.role === "PLAYER" && (
              <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-ocean/20 bg-ocean-soft px-4 py-3">
                <p className="text-sm font-semibold text-navy">
                  You also have access to a venue team.
                </p>
                <form action={enterStaffWorkspaceAction}>
                  <button className="rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white">
                    Open staff workspace
                  </button>
                </form>
              </div>
            )}
          {children}
        </div>
      </main>
      {user.role === "PLAYER" && !workspace && activeBookingHold && (
        <ReservationHoldDock hold={activeBookingHold} hideOnOwnHub />
      )}
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
