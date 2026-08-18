"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PartnerStatus, Role } from "@prisma/client";

import { dashboardHomeFor } from "@/lib/dashboard";
import type { PartnerWorkspace, StaffModule } from "@/lib/staffing";

type Item = {
  href: string;
  label: string;
  exact?: boolean;
  playerOnly?: boolean;
  partnerOnly?: boolean;
  messagesOnly?: boolean;
  staffModule?: StaffModule;
  ownerOnly?: boolean;
  icon: ReactNode;
};

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const items: Item[] = [
  {
    href: "/dashboard",
    label: "Home",
    exact: true,
    icon: (
      <svg {...iconProps}>
        <path d="M3 9.5 12 3l9 6.5" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/dashboard/hubs",
    label: "My Hubs",
    partnerOnly: true,
    staffModule: "hubs",
    icon: (
      <svg {...iconProps}>
        <path d="M3 21h18M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    partnerOnly: true,
    staffModule: "reports",
    icon: (
      <svg {...iconProps}>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-5 3 3 5-7" />
      </svg>
    ),
  },
  {
    href: "/dashboard/bookings",
    label: "Bookings",
    partnerOnly: true,
    staffModule: "bookings",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/messages",
    label: "Messages",
    partnerOnly: true,
    messagesOnly: true,
    staffModule: "messages",
    icon: (
      <svg {...iconProps}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/events",
    label: "Events",
    partnerOnly: true,
    staffModule: "events",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h3M13 15h3" />
      </svg>
    ),
  },
  {
    href: "/dashboard/bunalq",
    label: "BunalQ",
    partnerOnly: true,
    staffModule: "openPlay",
    icon: (
      <svg {...iconProps}>
        <path d="M4 6h16M4 12h10M4 18h7" />
        <circle cx="19" cy="17" r="3" />
      </svg>
    ),
  },
  {
    href: "/dashboard/payments",
    label: "Payments",
    partnerOnly: true,
    staffModule: "payments",
    icon: (
      <svg {...iconProps}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    href: "/dashboard/team",
    label: "Team",
    partnerOnly: true,
    ownerOnly: true,
    icon: (
      <svg {...iconProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/events",
    label: "Events",
    playerOnly: true,
    icon: (
      <svg {...iconProps}>
        <path d="M6 4h12v3a6 6 0 0 1-12 0z" />
        <path d="M6 5H4v2a3 3 0 0 0 3 3M18 5h2v2a3 3 0 0 1-3 3" />
        <path d="M9 18h6M10 14v4M14 14v4M8 21h8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/bookings",
    label: "Bookings",
    playerOnly: true,
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/dashboard/messages",
    label: "Messages",
    playerOnly: true,
    messagesOnly: true,
    icon: (
      <svg {...iconProps}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/account",
    label: "Account Settings",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export function DashboardNav({
  role,
  partnerStatus,
  hasMessages = false,
  workspace,
}: {
  role?: Role;
  partnerStatus?: PartnerStatus | null;
  hasMessages?: boolean;
  workspace?: PartnerWorkspace | null;
}) {
  const pathname = usePathname();

  const isActive = (item: Item) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const linkClass = (active: boolean) =>
    `flex min-h-11 items-center gap-3 whitespace-nowrap border-l-[3px] px-3 py-2.5 text-sm font-semibold transition-colors md:rounded-xl ${
      active
        ? "border-primary bg-primary-soft text-primary md:border-accent md:bg-white/10 md:text-white"
        : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-navy md:text-white/55 md:hover:bg-white/5 md:hover:text-white"
    }`;

  const visibleItems = items
    .filter(
      (item) =>
        (!item.playerOnly ||
          (role === "PLAYER" && workspace?.kind !== "STAFF")) &&
        (!item.messagesOnly || hasMessages) &&
        (!item.ownerOnly || workspace?.kind === "OWNER") &&
        (!item.partnerOnly ||
          (role === "PARTNER" && partnerStatus === "ACTIVE") ||
          (workspace?.kind === "STAFF" &&
            (!item.staffModule ||
              workspace.permissions[item.staffModule] !== "NONE")))
    )
    // Home points straight at the role's own dashboard, so the link highlights
    // when you're on it — /dashboard only ever redirects there anyway.
    .map((item) =>
      item.href === "/dashboard" && role
        ? {
            ...item,
            href:
              workspace?.kind === "STAFF"
                ? "/dashboard/partner"
                : dashboardHomeFor(role),
          }
        : item
    );

  return (
    <nav
      className={`${
        role === "ADMIN" ? "flex" : "hidden"
      } flex-row gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 md:mt-3 md:flex md:flex-col md:overflow-visible md:border-0 md:px-0 md:py-0`}
    >
      {visibleItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item) ? "page" : undefined}
          className={linkClass(isActive(item))}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}

      {role === "PARTNER" && partnerStatus === "DRAFT" && (
        <Link
          href="/dashboard/partner/onboarding"
          aria-current={
            pathname.startsWith("/dashboard/partner/onboarding")
              ? "page"
              : undefined
          }
          className={linkClass(
            pathname.startsWith("/dashboard/partner/onboarding")
          )}
        >
          <svg {...iconProps}>
            <path d="M3 21h18M5 21V8l7-4 7 4v13" />
            <path d="M9 21v-6h6v6" />
          </svg>
          <span>Venue application</span>
        </Link>
      )}

      {role === "ADMIN" && (
        <Link
          href="/dashboard/admin/payments"
          aria-current={
            pathname.startsWith("/dashboard/admin/payments")
              ? "page"
              : undefined
          }
          className={`${linkClass(
            pathname.startsWith("/dashboard/admin/payments")
          )} md:mt-3`}
        >
          <svg {...iconProps}>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20M16 15h2" />
          </svg>
          <span>Payment setup</span>
        </Link>
      )}

      {role === "ADMIN" && (
        <Link
          href="/dashboard/admin/reports"
          aria-current={
            pathname.startsWith("/dashboard/admin/reports") ? "page" : undefined
          }
          className={linkClass(pathname.startsWith("/dashboard/admin/reports"))}
        >
          <svg {...iconProps}>
            <path d="M3 3v18h18" />
            <path d="M7 15l4-5 3 3 5-7" />
          </svg>
          <span>Reports</span>
        </Link>
      )}

      {role === "ADMIN" && (
        <Link
          href="/dashboard/admin/settlements"
          aria-current={
            pathname.startsWith("/dashboard/admin/settlements")
              ? "page"
              : undefined
          }
          className={linkClass(
            pathname.startsWith("/dashboard/admin/settlements")
          )}
        >
          <svg {...iconProps}>
            <path d="M4 4h16v16H4z" />
            <path d="M8 9h8M8 13h5M8 17h3" />
          </svg>
          <span>Settlements</span>
        </Link>
      )}

      {role === "ADMIN" && (
        <Link
          href="/dashboard/admin/messages"
          aria-current={pathname.startsWith("/dashboard/admin/messages") ? "page" : undefined}
          className={linkClass(pathname.startsWith("/dashboard/admin/messages"))}
        >
          <svg {...iconProps}>
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
            <path d="m9 10 2 2 4-4" />
          </svg>
          <span>Message reports</span>
        </Link>
      )}

      {role === "ADMIN" && (
        <Link
          href="/users"
          aria-current={
            pathname === "/users" || pathname.startsWith("/users/")
              ? "page"
              : undefined
          }
          className={linkClass(
            pathname === "/users" || pathname.startsWith("/users/")
          )}
        >
          <svg {...iconProps}>
            <path d="M12 3l8 4v5c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V7z" />
          </svg>
          <span>Manage Users</span>
        </Link>
      )}
    </nav>
  );
}
