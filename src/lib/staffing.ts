import "server-only";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getActivePartnerImpersonation } from "@/lib/impersonation";
import {
  STAFF_MODULES,
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

export const STAFF_WORKSPACE_COOKIE = "bunal_staff_workspace";

const fullAccess: StaffPermissions = {
  hubs: "MANAGE",
  bookings: "MANAGE",
  events: "MANAGE",
  reports: "MANAGE",
  messages: "MANAGE",
  payments: "MANAGE",
};

export async function getPartnerWorkspace({
  selectedStaffOnly = true,
}: {
  selectedStaffOnly?: boolean;
} = {}): Promise<PartnerWorkspace | null> {
  const actor = await getAuthenticatedUser();
  if (!actor) return null;

  if (actor.role === "ADMIN") {
    const impersonation = await getActivePartnerImpersonation(actor.id);
    if (!impersonation || impersonation.partner.partnerStatus !== "ACTIVE") {
      return null;
    }
    return {
      kind: "ADMIN_ASSIST",
      actorId: actor.id,
      partnerId: impersonation.partner.id,
      partnerName:
        impersonation.partner.name ?? impersonation.partner.email,
      membershipId: null,
      permissions: fullAccess,
    };
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
    where: { userId: actor.id },
    select: {
      id: true,
      partnerId: true,
      hubs: true,
      bookings: true,
      events: true,
      reports: true,
      messages: true,
      payments: true,
      partner: {
        select: { name: true, email: true, partnerStatus: true },
      },
    },
  });
  if (!membership || membership.partner.partnerStatus !== "ACTIVE") return null;

  return {
    kind: "STAFF",
    actorId: actor.id,
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
  await prisma.partnerStaffActivity.create({
    data: {
      partnerId: input.workspace.partnerId,
      actorId: input.workspace.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
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

export async function listOperationalRecipients(
  partnerId: string,
  module: "bookings" | "events"
) {
  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      email: true,
      name: true,
      playerName: true,
      staffMembershipsOwned: {
        where: { [module]: "MANAGE" },
        select: {
          id: true,
          user: { select: { email: true, name: true, playerName: true } },
        },
      },
    },
  });
  if (!partner) return [];
  return [
    {
      key: `owner-${partner.id}`,
      email: partner.email,
      name: partner.playerName ?? partner.name ?? "Partner",
    },
    ...partner.staffMembershipsOwned.map((membership) => ({
      key: `staff-${membership.id}`,
      email: membership.user.email,
      name:
        membership.user.playerName ?? membership.user.name ?? "Team member",
    })),
  ];
}
