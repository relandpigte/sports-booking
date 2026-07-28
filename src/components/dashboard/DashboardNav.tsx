"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

type Item = {
  href: string;
  label: string;
  exact?: boolean;
  playerOnly?: boolean;
  partnerOnly?: boolean;
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
    icon: (
      <svg {...iconProps}>
        <path d="M3 21h18M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/billing",
    label: "Billing",
    partnerOnly: true,
    icon: (
      <svg {...iconProps}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    href: "/dashboard/tournaments",
    label: "Tournaments",
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

export function DashboardNav({ role }: { role?: Role }) {
  const pathname = usePathname();

  const isActive = (item: Item) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-primary-soft text-primary"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  const visibleItems = items.filter(
    (item) =>
      (!item.playerOnly || role === "PLAYER") &&
      (!item.partnerOnly || role === "PARTNER")
  );

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
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

      {role === "ADMIN" && (
        <Link
          href="/users"
          aria-current={
            pathname === "/users" || pathname.startsWith("/users/")
              ? "page"
              : undefined
          }
          className={`${linkClass(
            pathname === "/users" || pathname.startsWith("/users/")
          )} md:mt-2 md:border-t md:border-gray-100 md:pt-3`}
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
