import type { StaffAccessLevel } from "@prisma/client";

export const STAFF_MODULES = [
  "hubs",
  "bookings",
  "events",
  "reports",
  "messages",
  "payments",
  "openPlay",
] as const;

export type StaffModule = (typeof STAFF_MODULES)[number];

// Set while a staff member works in their partner's workspace instead of
// their personal player account.
export const STAFF_WORKSPACE_COOKIE = "bunal_staff_workspace";
export type WorkspaceKind = "OWNER" | "STAFF" | "ADMIN_ASSIST";
export type StaffPermissions = Record<StaffModule, StaffAccessLevel>;

export type PartnerWorkspace = {
  kind: WorkspaceKind;
  actorId: string;
  partnerId: string;
  partnerName: string;
  membershipId: string | null;
  permissions: StaffPermissions;
  // Set when an admin is assisting a staff member in this workspace.
  assistedByAdminId?: string;
};

export function hasStaffAccess(
  workspace: PartnerWorkspace,
  module: StaffModule,
  required: "VIEW" | "MANAGE"
): boolean {
  const actual = workspace.permissions[module];
  return actual === "MANAGE" || (required === "VIEW" && actual === "VIEW");
}
