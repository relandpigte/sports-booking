import type { PartnerStatus, Role } from "@prisma/client";

import type { DashboardIconName } from "@/components/dashboard/DashboardIcon";
import type { PartnerWorkspace, StaffModule } from "@/lib/staffing-shared";

export type DashboardNavigationItem = {
  href: string;
  label: string;
  icon: DashboardIconName;
  exact?: boolean;
  accountOnly?: boolean;
  staffModule?: StaffModule;
  ownerOnly?: boolean;
};

type NavigationContext = {
  role: Role;
  partnerStatus: PartnerStatus | null;
  hasMessages?: boolean;
  workspace?: PartnerWorkspace | null;
};

const playerItems: DashboardNavigationItem[] = [
  { href: "/dashboard/player", label: "Home", icon: "home", exact: true },
  { href: "/hubs", label: "Find Courts", icon: "map" },
  { href: "/events", label: "Events", icon: "trophy" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "booking" },
  { href: "/trainers", label: "Find Trainers", icon: "profile" },
  { href: "/dashboard/trainer", label: "Trainer Tools", icon: "account" },
  { href: "/dashboard/messages", label: "Messages", icon: "message" },
  { href: "/dashboard/tournaments", label: "Tournaments", icon: "trophy" },
  {
    href: "/dashboard/account",
    label: "Account Settings",
    icon: "account",
    accountOnly: true,
  },
];

const partnerItems: DashboardNavigationItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  {
    href: "/dashboard/bookings",
    label: "Bookings",
    icon: "booking",
    staffModule: "bookings",
  },
  {
    href: "/dashboard/hubs",
    label: "My Hubs",
    icon: "hub",
    staffModule: "hubs",
  },
  {
    href: "/dashboard/payments",
    label: "Payments",
    icon: "payment",
    staffModule: "payments",
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: "report",
    staffModule: "reports",
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: "trophy",
    staffModule: "events",
  },
  {
    href: "/dashboard/messages",
    label: "Messages",
    icon: "message",
    staffModule: "messages",
  },
  {
    href: "/dashboard/bunalq",
    label: "BunalQ",
    icon: "booking",
    staffModule: "openPlay",
  },
  {
    href: "/dashboard/team",
    label: "Team",
    icon: "users",
    ownerOnly: true,
  },
  {
    href: "/dashboard/account",
    label: "Account Settings",
    icon: "account",
    accountOnly: true,
  },
];

const pendingPartnerItems: DashboardNavigationItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  {
    href: "/dashboard/account",
    label: "Account Settings",
    icon: "account",
    accountOnly: true,
  },
];

const draftPartnerItems: DashboardNavigationItem[] = [
  { href: "/dashboard/partner", label: "Home", icon: "home", exact: true },
  {
    href: "/dashboard/partner/onboarding",
    label: "Venue application",
    icon: "hub",
  },
  {
    href: "/dashboard/account",
    label: "Account Settings",
    icon: "account",
    accountOnly: true,
  },
];

const adminItems: DashboardNavigationItem[] = [
  { href: "/dashboard/admin", label: "Home", icon: "home", exact: true },
  {
    href: "/dashboard/admin/trainers",
    label: "Trainer reviews",
    icon: "profile",
  },
  {
    href: "/dashboard/admin/payments",
    label: "Payment setup",
    icon: "payment",
  },
  {
    href: "/dashboard/admin/settlements",
    label: "Settlements",
    icon: "booking",
  },
  { href: "/dashboard/admin/reports", label: "Reports", icon: "report" },
  { href: "/users", label: "Manage Users", icon: "shield" },
  {
    href: "/dashboard/admin/messages",
    label: "Message reports",
    icon: "message",
  },
  {
    href: "/dashboard/account",
    label: "Account Settings",
    icon: "account",
    accountOnly: true,
  },
];

export function getDashboardNavigationItems({
  role,
  partnerStatus,
  hasMessages = false,
  workspace,
}: NavigationContext): DashboardNavigationItem[] {
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

  return roleItems.filter((item) => {
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
}

export function dashboardPathMatches(
  pathname: string,
  item: DashboardNavigationItem
) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
