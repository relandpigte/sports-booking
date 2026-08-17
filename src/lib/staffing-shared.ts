import type { StaffAccessLevel } from "@prisma/client";

export const STAFF_MODULES = [
  "hubs",
  "bookings",
  "events",
  "reports",
  "messages",
  "payments",
] as const;

export type StaffModule = (typeof STAFF_MODULES)[number];
export type WorkspaceKind = "OWNER" | "STAFF" | "ADMIN_ASSIST";
export type StaffPermissions = Record<StaffModule, StaffAccessLevel>;

export type PartnerWorkspace = {
  kind: WorkspaceKind;
  actorId: string;
  partnerId: string;
  partnerName: string;
  membershipId: string | null;
  permissions: StaffPermissions;
};

export function hasStaffAccess(
  workspace: PartnerWorkspace,
  module: StaffModule,
  required: "VIEW" | "MANAGE"
): boolean {
  const actual = workspace.permissions[module];
  return actual === "MANAGE" || (required === "VIEW" && actual === "VIEW");
}
