import type { Role } from "@prisma/client";

// Where each role's dashboard lives. Kept in one place so the redirector, the
// nav's active state and the role guards can't drift apart.
export const DASHBOARD_HOME: Record<Role, string> = {
  ADMIN: "/dashboard/admin",
  PARTNER: "/dashboard/partner",
  PLAYER: "/dashboard/player",
};

export function dashboardHomeFor(role: Role): string {
  return DASHBOARD_HOME[role];
}
