import "server-only";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getActiveImpersonation } from "@/lib/impersonation";
import {
  STAFF_MODULES,
  STAFF_WORKSPACE_COOKIE,
  hasStaffAccess,
  type PartnerWorkspace,
  type StaffModule,
  type StaffPermissions,
} from "@/lib/staffing-shared";

export {
  STAFF_MODULES,
  hasStaffAccess,
  type PartnerWorkspace,
  type StaffModule,
  type StaffPermissions,
} from "@/lib/staffing-shared";
export { listOperationalRecipients } from "@/lib/operational-recipients";
export { STAFF_WORKSPACE_COOKIE } from "@/lib/staffing-shared";

const fullAccess: StaffPermissions = {
  hubs: "MANAGE",
  bookings: "MANAGE",
  events: "MANAGE",
  reports: "MANAGE",
  messages: "MANAGE",
  payments: "MANAGE",
  openPlay: "MANAGE",
};

export async function getPartnerWorkspace({
  selectedStaffOnly = true,
}: {
  selectedStaffOnly?: boolean;
} = {}): Promise<PartnerWorkspace | null> {
  const actor = await getAuthenticatedUser();
  if (!actor) return null;

  if (actor.role === "ADMIN") {
    const impersonation = await getActiveImpersonation(actor.id);
    if (!impersonation) return null;
    const assisted = impersonation.user;
    if (assisted.role === "PARTNER") {
      if (assisted.partnerStatus !== "ACTIVE") return null;
      return {
        kind: "ADMIN_ASSIST",
        actorId: actor.id,
        partnerId: assisted.id,
        partnerName: assisted.name ?? assisted.email,
        membershipId: null,
        permissions: fullAccess,
      };
    }
    // An admin assisting a staff member gets exactly that member's access,
    // recorded under the admin's own id.
    if (assisted.role !== "PLAYER") return null;
    const workspace = await resolveStaffWorkspace(assisted.id, selectedStaffOnly);
    return workspace
      ? { ...workspace, actorId: actor.id, assistedByAdminId: actor.id }
      : null;
  }

  if (actor.role === "PARTNER") {
    if (actor.partnerStatus !== "ACTIVE") return null;
    return {
      kind: "OWNER",
      actorId: actor.id,
      partnerId: actor.id,
      partnerName: actor.name ?? actor.email,
      membershipId: null,
      permissions: fullAccess,
    };
  }

  if (actor.role !== "PLAYER") return null;
  return resolveStaffWorkspace(actor.id, selectedStaffOnly);
}

async function resolveStaffWorkspace(
  playerId: string,
  selectedStaffOnly: boolean
): Promise<PartnerWorkspace | null> {
  if (selectedStaffOnly) {
    let selected: string | undefined;
    try {
      selected = (await cookies()).get(STAFF_WORKSPACE_COOKIE)?.value;
    } catch {
      // Integration checks and background reads have no request cookie store;
      // without an explicit selection they stay in the personal workspace.
      selected = undefined;
    }
    if (selected !== "1") return null;
  }

  const membership = await prisma.partnerStaffMembership.findUnique({
    where: { userId: playerId },
    select: {
      id: true,
      partnerId: true,
      hubs: true,
      bookings: true,
      events: true,
      reports: true,
      messages: true,
      payments: true,
      openPlay: true,
      partner: {
        select: { name: true, email: true, partnerStatus: true },
      },
    },
  });
  if (!membership || membership.partner.partnerStatus !== "ACTIVE") return null;

  return {
    kind: "STAFF",
    actorId: playerId,
    partnerId: membership.partnerId,
    partnerName: membership.partner.name ?? membership.partner.email,
    membershipId: membership.id,
    permissions: {
      hubs: membership.hubs,
      bookings: membership.bookings,
      events: membership.events,
      reports: membership.reports,
      messages: membership.messages,
      payments: membership.payments,
      openPlay: membership.openPlay,
    },
  };
}

export async function requirePartnerWorkspace(
  module: StaffModule,
  required: "VIEW" | "MANAGE" = "VIEW"
): Promise<PartnerWorkspace> {
  const workspace = await getPartnerWorkspace();
  if (!workspace) redirect("/dashboard");
  if (!hasStaffAccess(workspace, module, required)) {
    redirect("/dashboard/partner?access=denied");
  }
  return workspace;
}

export async function recordPartnerActivity(input: {
  workspace: PartnerWorkspace;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  if (input.workspace.kind !== "STAFF") return;
  const assistedBy = input.workspace.assistedByAdminId;
  const metadata = assistedBy
    ? {
        ...(isJsonObject(input.metadata) ? input.metadata : {}),
        assistedByAdminId: assistedBy,
      }
    : input.metadata;
  await prisma.partnerStaffActivity.create({
    data: {
      partnerId: input.workspace.partnerId,
      actorId: input.workspace.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata,
    },
  });
}

export function permissionSummary(permissions: StaffPermissions): string[] {
  return STAFF_MODULES.flatMap((module) => {
    const access = permissions[module];
    if (access === "NONE") return [];
    const label = module[0].toUpperCase() + module.slice(1);
    return [`${label}: ${access === "MANAGE" ? "manage" : "view"}`];
  });
}

function isJsonObject(
  value: Prisma.InputJsonValue | undefined
): value is Prisma.InputJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
