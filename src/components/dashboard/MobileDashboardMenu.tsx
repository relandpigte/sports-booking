"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PartnerStatus, Role } from "@prisma/client";

import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/DashboardIcon";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { logoutAction } from "@/lib/actions";
import type { PartnerWorkspace, StaffModule } from "@/lib/staffing";

type MobileMenuItem = {
  href: string;
  label: string;
  icon: DashboardIconName;
  exact?: boolean;
  staffModule?: StaffModule;
  ownerOnly?: boolean;
};

const playerItems: MobileMenuItem[] = [
  { href: "/dashboard/player", label: "Home", icon: "home", exact: true },
  { href: "/hubs", label: "Courts", icon: "map" },
  { href: "/events", label: "Events", icon: "trophy" },
  { href: "/trainers", label: "Find Trainers", icon: "account" },
  { href: "/dashboard/trainer", label: "Trainer Tools", icon: "account" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "booking" },
  { href: "/dashboard/messages", label: "Messages", icon: "message" },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: "trophy" },
  { href: "/leaderboard", label: "Leaderboard", icon: "report" },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const partnerItems: MobileMenuItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/bookings", label: "Bookings", icon: "booking", staffModule: "bookings" },
  { href: "/dashboard/messages", label: "Messages", icon: "message", staffModule: "messages" },
  { href: "/dashboard/hubs", label: "My Hubs", icon: "hub", staffModule: "hubs" },
  { href: "/dashboard/reports", label: "Reports", icon: "report", staffModule: "reports" },
  { href: "/dashboard/events", label: "Events", icon: "trophy", staffModule: "events" },
  { href: "/dashboard/bunalq", label: "BunalQ", icon: "booking", staffModule: "openPlay" },
  { href: "/dashboard/payments", label: "Payments", icon: "payment", staffModule: "payments" },
  { href: "/dashboard/team", label: "Team", icon: "account", ownerOnly: true },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const pendingPartnerItems: MobileMenuItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const draftPartnerItems: MobileMenuItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  {
    href: "/dashboard/partner/onboarding",
    label: "Venue application",
    icon: "hub",
  },
  { href: "/dashboard/account", label: "Account", icon: "account" },
];

const adminItems: MobileMenuItem[] = [
  { href: "/dashboard/admin", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/account", label: "Account Settings", icon: "account" },
  { href: "/dashboard/admin/trainers", label: "Trainer reviews", icon: "account" },
  {
    href: "/dashboard/admin/payments",
    label: "Payment setup",
    icon: "payment",
  },
  { href: "/dashboard/admin/reports", label: "Reports", icon: "report" },
  {
    href: "/dashboard/admin/settlements",
    label: "Settlements",
    icon: "booking",
  },
  {
    href: "/dashboard/admin/messages",
    label: "Message reports",
    icon: "message",
  },
  { href: "/users", label: "Manage Users", icon: "shield" },
];

function pathMatches(pathname: string, item: MobileMenuItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileDashboardMenu({
  role,
  partnerStatus,
  displayName,
  email,
  image,
  workspaceLabel,
  hasMessages = false,
  workspace,
}: {
  role: Role;
  partnerStatus: PartnerStatus | null;
  displayName: string;
  email: string;
  image: string | null;
  workspaceLabel: string;
  hasMessages?: boolean;
  workspace?: PartnerWorkspace | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const staffWorkspace = workspace?.kind === "STAFF";
  const roleItems =
    role === "ADMIN"
      ? adminItems
      : staffWorkspace
        ? partnerItems
      : role === "PLAYER"
        ? playerItems
        : partnerStatus === "ACTIVE"
          ? partnerItems
          : partnerStatus === "DRAFT"
            ? draftPartnerItems
            : pendingPartnerItems;
  const items = roleItems.filter((item) => {
    if (item.href === "/dashboard/messages" && !hasMessages) return false;
    if (item.ownerOnly && workspace?.kind !== "OWNER") return false;
    if (
      staffWorkspace &&
      item.staffModule &&
      workspace.permissions[item.staffModule] === "NONE"
    ) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation menu"
        aria-controls="mobile-dashboard-drawer"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-navy transition-colors hover:border-primary/30 hover:bg-primary-soft"
      >
        <MenuIcon />
      </button>

      <div
        aria-hidden="true"
        onClick={() => closeMenu({ restoreFocus: true })}
        className={`fixed inset-0 z-[60] bg-navy/60 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        ref={drawerRef}
        id="mobile-dashboard-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-dashboard-menu-title"
        aria-hidden={!open}
        inert={!open}
        onKeyDown={trapFocus}
        className={`fixed inset-y-0 left-0 z-[70] flex w-[min(84vw,340px)] min-w-0 flex-col bg-navy pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <Link
            href="/dashboard"
            aria-label="Bunal.club dashboard home"
            onClick={() => closeMenu()}
          >
            <Logo />
          </Link>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation menu"
            onClick={() => closeMenu({ restoreFocus: true })}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="border-b border-white/10 px-5 py-5">
          <p
            id="mobile-dashboard-menu-title"
            className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35"
          >
            {workspaceLabel}
          </p>
          <div className="mt-4 flex min-w-0 items-center gap-3">
            <Avatar
              src={image}
              name={displayName}
              size={40}
              className="ring-2 ring-white/15"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {displayName}
              </p>
              <p className="truncate text-xs text-white/40">{email}</p>
            </div>
          </div>
        </div>

        <nav
          aria-label="Mobile dashboard navigation"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        >
          {items.map((item) => {
            const active = pathMatches(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => closeMenu()}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl border-l-[3px] px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-accent bg-white/10 text-white"
                    : "border-transparent text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                <DashboardIcon name={item.icon} className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <form action={logoutAction} className="border-t border-white/10 p-4">
          <button
            type="submit"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-4 text-sm font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogoutIcon />
            Log out
          </button>
        </form>
      </aside>
    </>
  );
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
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
