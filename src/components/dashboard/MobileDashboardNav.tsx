"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PartnerStatus, Role } from "@prisma/client";

import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/DashboardIcon";
import { Modal } from "@/components/ui/Modal";
import { logoutAction } from "@/lib/actions";

type MobileNavItem = {
  href: string;
  label: string;
  icon: DashboardIconName;
  exact?: boolean;
};

const playerPrimary: MobileNavItem[] = [
  { href: "/dashboard/player", label: "Home", icon: "home", exact: true },
  { href: "/hubs", label: "Courts", icon: "map" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "booking" },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const partnerPrimary: MobileNavItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/bookings", label: "Bookings", icon: "booking" },
  { href: "/dashboard/hubs", label: "Hubs", icon: "hub" },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const pendingPartnerPrimary: MobileNavItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const playerSecondary: MobileNavItem[] = [
  { href: "/events", label: "Events", icon: "trophy" },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: "trophy" },
  { href: "/leaderboard", label: "Leaderboard", icon: "report" },
];

const partnerSecondary: MobileNavItem[] = [
  { href: "/dashboard/reports", label: "Reports", icon: "report" },
  { href: "/dashboard/events", label: "Events", icon: "trophy" },
  { href: "/dashboard/payments", label: "Payments", icon: "payment" },
];

function pathMatches(pathname: string, item: MobileNavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileDashboardNav({
  role,
  partnerStatus,
}: {
  role: Role;
  partnerStatus: PartnerStatus | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (role === "ADMIN") return null;

  const activePartner = role === "PARTNER" && partnerStatus === "ACTIVE";
  const primary =
    role === "PLAYER"
      ? playerPrimary
      : activePartner
        ? partnerPrimary
        : pendingPartnerPrimary;
  const secondary =
    role === "PLAYER" ? playerSecondary : activePartner ? partnerSecondary : [];
  const moreActive = secondary.some((item) => pathMatches(pathname, item));

  return (
    <>
      <nav
        aria-label="Mobile dashboard navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(16,36,58,0.08)] backdrop-blur md:hidden"
      >
        <div
          className="grid min-h-16 items-stretch"
          style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
        >
          {primary.map((item) => {
            const active = pathMatches(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold transition-colors ${
                  active ? "text-primary" : "text-slate-500 hover:text-navy"
                }`}
              >
                <DashboardIcon name={item.icon} className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold transition-colors ${
              moreActive || moreOpen
                ? "text-primary"
                : "text-slate-500 hover:text-navy"
            }`}
          >
            <DashboardIcon name="more" className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
              >
                Log out
              </button>
            </form>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-navy transition-colors hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        }
      >
        {secondary.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {secondary.map((item) => {
              const active = pathMatches(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 font-semibold transition-colors ${
                    active
                      ? "border-primary/30 bg-primary-soft text-primary"
                      : "border-slate-200 text-navy hover:bg-slate-50"
                  }`}
                >
                  <DashboardIcon name={item.icon} className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 leading-6 text-slate-500">
            Additional venue tools become available after partner approval.
          </p>
        )}
      </Modal>
    </>
  );
}
