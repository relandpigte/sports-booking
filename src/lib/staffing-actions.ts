"use server";

import crypto from "node:crypto";

import { Prisma, type StaffAccessLevel } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/dal";
import { dashboardHomeFor } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import {
  emailDeliveryConfigured,
  sendStaffInvitationEmail,
} from "@/lib/email";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  permissionSummary,
  STAFF_MODULES,
  STAFF_WORKSPACE_COOKIE,
  type StaffPermissions,
} from "@/lib/staffing";
import { appUrl } from "@/lib/urls";

const INVITATION_DAYS = 7;
const emailSchema = z.email().transform((value) =>
  value.trim().toLocaleLowerCase("en-PH")
);
const accessLevels = new Set<StaffAccessLevel>(["NONE", "VIEW", "MANAGE"]);

export type StaffingFormState = {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
}

function parsePermissions(formData: FormData):
  | { permissions: StaffPermissions }
  | { errors: Record<string, string> } {
  const permissions = Object.fromEntries(
    STAFF_MODULES.map((module) => {
      const raw = String(formData.get(module) ?? "NONE") as StaffAccessLevel;
      return [module, accessLevels.has(raw) ? raw : "NONE"];
    })
  ) as StaffPermissions;
  if (permissions.reports === "MANAGE") {
    return { errors: { reports: "Reports can be view-only." } };
  }
  if (STAFF_MODULES.every((module) => permissions[module] === "NONE")) {
    return { errors: { permissions: "Enable at least one staff module." } };
  }
  return { permissions };
}

async function requireActivePartnerOwner() {
  const actor = await getAuthenticatedUser();
  if (
    !actor ||
    actor.role !== "PARTNER" ||
    actor.partnerStatus !== "ACTIVE"
  ) {
    return null;
  }
  return actor;
}

async function deliverInvitation(input: {
  rawToken: string;
  invitationId: string;
  email: string;
  expiresAt: Date;
  partnerName: string;
  inviterName: string;
  permissions: StaffPermissions;
}): Promise<boolean> {
  if (!emailDeliveryConfigured()) return false;
  try {
    await sendStaffInvitationEmail({
      to: input.email,
      partnerName: input.partnerName,
      inviterName: input.inviterName,
      permissions: permissionSummary(input.permissions),
      acceptUrl: appUrl(`/staff/invite/${input.rawToken}`),
      expiresAt: input.expiresAt,
      idempotencyKey: `staff-invite-${input.invitationId}-${hashInvitationToken(input.rawToken).slice(0, 16)}`,
    });
    return true;
  } catch (error) {
    console.error(
      "Staff invitation delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
    return false;
  }
}

export async function inviteStaffAction(
  _previous: StaffingFormState,
  formData: FormData
): Promise<StaffingFormState> {
  const owner = await requireActivePartnerOwner();
  if (!owner) return { message: "Only an active partner owner can invite staff." };
  if (!(await consumeRateLimit({
    namespace: "staff-invitation",
    subject: owner.id,
    limit: 10,
    windowSeconds: 60 * 60,
  }))) {
    return { message: "Too many invitations. Try again later." };
  }

  const parsedEmail = emailSchema.safeParse(String(formData.get("email") ?? ""));
  const parsedPermissions = parsePermissions(formData);
  if (!parsedEmail.success || "errors" in parsedPermissions) {
    return {
      errors: {
        ...(!parsedEmail.success ? { email: "Enter a valid email address." } : {}),
        ...("errors" in parsedPermissions ? parsedPermissions.errors : {}),
      },
      values: { email: String(formData.get("email") ?? "") },
    };
  }
  const email = parsedEmail.data;
  const permissions = parsedPermissions.permissions;
  if (email === owner.email.toLocaleLowerCase("en-PH")) {
    return { errors: { email: "You cannot invite your own account." }, values: { email } };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      staffMembership: { select: { partnerId: true } },
    },
  });
  if (existingUser?.role !== undefined && existingUser.role !== "PLAYER") {
    return { errors: { email: "Only player accounts can join a partner team." }, values: { email } };
  }
  if (existingUser?.staffMembership) {
    return { errors: { email: "This account already belongs to a partner team." }, values: { email } };
  }

  const currentInvite = await prisma.partnerStaffInvitation.findUnique({
    where: { email },
    select: { id: true, partnerId: true, expiresAt: true },
  });
  if (
    currentInvite &&
    currentInvite.partnerId !== owner.id &&
    currentInvite.expiresAt > new Date()
  ) {
    return { errors: { email: "This email already has a pending team invitation." }, values: { email } };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = invitationExpiry();
  const invitation = await prisma.$transaction(async (tx) => {
    if (currentInvite && currentInvite.partnerId !== owner.id) {
      await tx.partnerStaffInvitation.delete({ where: { id: currentInvite.id } });
    }
    const row = await tx.partnerStaffInvitation.upsert({
      where: { email },
      create: {
        partnerId: owner.id,
        invitedById: owner.id,
        email,
        tokenHash: hashInvitationToken(rawToken),
        expiresAt,
        ...permissions,
      },
      update: {
        partnerId: owner.id,
        invitedById: owner.id,
        tokenHash: hashInvitationToken(rawToken),
        expiresAt,
        ...permissions,
      },
      select: { id: true },
    });
    await tx.partnerStaffActivity.create({
      data: {
        partnerId: owner.id,
        actorId: owner.id,
        action: currentInvite ? "STAFF_INVITATION_RESENT" : "STAFF_INVITED",
        targetType: "PartnerStaffInvitation",
        targetId: row.id,
        metadata: { email, permissions },
      },
    });
    return row;
  });

  const delivered = await deliverInvitation({
    rawToken,
    invitationId: invitation.id,
    email,
    expiresAt,
    partnerName: owner.name ?? owner.email,
    inviterName: owner.playerName ?? owner.name ?? owner.email,
    permissions,
  });
  revalidatePath("/dashboard/team");
  return {
    success: delivered
      ? `Invitation sent to ${email}.`
      : `Invitation saved for ${email}, but email delivery failed. Use Resend after email is configured.`,
  };
}

export async function resendStaffInvitationAction(formData: FormData) {
  const owner = await requireActivePartnerOwner();
  if (!owner) return;
  const invitationId = String(formData.get("invitationId") ?? "");
  const invitation = await prisma.partnerStaffInvitation.findFirst({
    where: { id: invitationId, partnerId: owner.id },
  });
  if (!invitation) return;
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = invitationExpiry();
  await prisma.partnerStaffInvitation.update({
    where: { id: invitation.id },
    data: { tokenHash: hashInvitationToken(rawToken), expiresAt, invitedById: owner.id },
  });
  await deliverInvitation({
    rawToken,
    invitationId: invitation.id,
    email: invitation.email,
    expiresAt,
    partnerName: owner.name ?? owner.email,
    inviterName: owner.playerName ?? owner.name ?? owner.email,
    permissions: Object.fromEntries(
      STAFF_MODULES.map((module) => [module, invitation[module]])
    ) as StaffPermissions,
  });
  await prisma.partnerStaffActivity.create({
    data: {
      partnerId: owner.id,
      actorId: owner.id,
      action: "STAFF_INVITATION_RESENT",
      targetType: "PartnerStaffInvitation",
      targetId: invitation.id,
      metadata: { email: invitation.email },
    },
  });
  revalidatePath("/dashboard/team");
}

export async function cancelStaffInvitationAction(formData: FormData) {
  const owner = await requireActivePartnerOwner();
  if (!owner) return;
  const id = String(formData.get("invitationId") ?? "");
  const invitation = await prisma.partnerStaffInvitation.findFirst({
    where: { id, partnerId: owner.id },
    select: { id: true, email: true },
  });
  if (!invitation) return;
  await prisma.$transaction([
    prisma.partnerStaffInvitation.delete({ where: { id: invitation.id } }),
    prisma.partnerStaffActivity.create({
      data: {
        partnerId: owner.id,
        actorId: owner.id,
        action: "STAFF_INVITATION_CANCELLED",
        targetType: "PartnerStaffInvitation",
        targetId: invitation.id,
        metadata: { email: invitation.email },
      },
    }),
  ]);
  revalidatePath("/dashboard/team");
}

export async function updateStaffPermissionsAction(
  _previous: StaffingFormState,
  formData: FormData
): Promise<StaffingFormState> {
  const owner = await requireActivePartnerOwner();
  if (!owner) return { message: "Only the partner owner can update staff." };
  const membershipId = String(formData.get("membershipId") ?? "");
  const parsed = parsePermissions(formData);
  if ("errors" in parsed) return { errors: parsed.errors };
  const membership = await prisma.partnerStaffMembership.findFirst({
    where: { id: membershipId, partnerId: owner.id },
    select: { id: true, user: { select: { email: true } } },
  });
  if (!membership) return { message: "Staff member not found." };
  await prisma.$transaction([
    prisma.partnerStaffMembership.update({
      where: { id: membership.id },
      data: parsed.permissions,
    }),
    prisma.partnerStaffActivity.create({
      data: {
        partnerId: owner.id,
        actorId: owner.id,
        action: "STAFF_PERMISSIONS_UPDATED",
        targetType: "PartnerStaffMembership",
        targetId: membership.id,
        metadata: { email: membership.user.email, permissions: parsed.permissions },
      },
    }),
  ]);
  revalidatePath("/dashboard/team");
  return { success: "Staff access updated." };
}

export async function removeStaffAction(formData: FormData) {
  const owner = await requireActivePartnerOwner();
  if (!owner) return;
  const membershipId = String(formData.get("membershipId") ?? "");
  const membership = await prisma.partnerStaffMembership.findFirst({
    where: { id: membershipId, partnerId: owner.id },
    select: { id: true, user: { select: { email: true } } },
  });
  if (!membership) return;
  await prisma.$transaction([
    prisma.partnerStaffMembership.delete({ where: { id: membership.id } }),
    prisma.partnerStaffActivity.create({
      data: {
        partnerId: owner.id,
        actorId: owner.id,
        action: "STAFF_REMOVED",
        targetType: "PartnerStaffMembership",
        targetId: membership.id,
        metadata: { email: membership.user.email },
      },
    }),
  ]);
  revalidatePath("/dashboard/team");
}

export async function acceptStaffInvitationAction(
  _previous: StaffingFormState,
  formData: FormData
): Promise<StaffingFormState> {
  const actor = await getAuthenticatedUser();
  const token = String(formData.get("token") ?? "");
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/staff/invite/${token}`)}`);
  if (actor.role !== "PLAYER") {
    return { message: "Only player accounts can accept staff invitations." };
  }
  const invitation = await prisma.partnerStaffInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { partner: { select: { partnerStatus: true } } },
  });
  if (!invitation || invitation.expiresAt <= new Date()) {
    return { message: "This invitation is invalid or has expired." };
  }
  if (invitation.partner.partnerStatus !== "ACTIVE") {
    return { message: "This partner team is not active." };
  }
  if (invitation.email !== actor.email.toLocaleLowerCase("en-PH")) {
    return { message: `Sign in with ${invitation.email} to accept this invitation.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.partnerStaffInvitation.deleteMany({
        where: {
          id: invitation.id,
          tokenHash: hashInvitationToken(token),
          expiresAt: { gt: new Date() },
        },
      });
      if (claimed.count !== 1) throw new Error("INVITATION_ALREADY_USED");
      const membership = await tx.partnerStaffMembership.create({
        data: {
          partnerId: invitation.partnerId,
          userId: actor.id,
          invitedById: invitation.invitedById,
          hubs: invitation.hubs,
          bookings: invitation.bookings,
          events: invitation.events,
          reports: invitation.reports,
          messages: invitation.messages,
          payments: invitation.payments,
          openPlay: invitation.openPlay,
        },
        select: { id: true },
      });
      await tx.partnerStaffActivity.create({
        data: {
          partnerId: invitation.partnerId,
          actorId: actor.id,
          action: "STAFF_INVITATION_ACCEPTED",
          targetType: "PartnerStaffMembership",
          targetId: membership.id,
          metadata: { email: actor.email },
        },
      });
    });
  } catch (error) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (error instanceof Error && error.message === "INVITATION_ALREADY_USED")
    ) {
      return { message: "This invitation was already used or the account belongs to another team." };
    }
    throw error;
  }

  const store = await cookies();
  store.set(STAFF_WORKSPACE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  redirect("/dashboard/partner");
}

export async function enterStaffWorkspaceAction() {
  const actor = await getAuthenticatedUser();
  if (!actor || actor.role !== "PLAYER") redirect("/dashboard");
  const membership = await prisma.partnerStaffMembership.findUnique({
    where: { userId: actor.id },
    select: { id: true, partner: { select: { partnerStatus: true } } },
  });
  if (!membership || membership.partner.partnerStatus !== "ACTIVE") {
    redirect("/dashboard/player");
  }
  (await cookies()).set(STAFF_WORKSPACE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  redirect("/dashboard/partner");
}

export async function enterPersonalWorkspaceAction() {
  const actor = await getAuthenticatedUser();
  if (!actor) redirect("/login");
  (await cookies()).delete(STAFF_WORKSPACE_COOKIE);
  redirect(dashboardHomeFor(actor.role));
}

export async function getStaffInvitationView(token: string) {
  if (token.length < 32 || token.length > 100) return null;
  const invitation = await prisma.partnerStaffInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      email: true,
      expiresAt: true,
      hubs: true,
      bookings: true,
      events: true,
      reports: true,
      messages: true,
      payments: true,
      openPlay: true,
      partner: { select: { name: true, email: true, partnerStatus: true } },
    },
  });
  if (!invitation || invitation.expiresAt <= new Date()) return null;
  return {
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    partnerName: invitation.partner.name ?? invitation.partner.email,
    active: invitation.partner.partnerStatus === "ACTIVE",
    permissions: Object.fromEntries(
      STAFF_MODULES.map((module) => [module, invitation[module]])
    ) as StaffPermissions,
  };
}

export async function listPartnerStaff(ownerId: string) {
  return Promise.all([
    prisma.partnerStaffMembership.findMany({
      where: { partnerId: ownerId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, playerName: true, email: true, image: true } },
      },
    }),
    prisma.partnerStaffInvitation.findMany({
      where: { partnerId: ownerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partnerStaffActivity.findMany({
      where: { partnerId: ownerId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        actor: {
          select: {
            name: true,
            playerName: true,
            email: true,
          },
        },
      },
    }),
  ]);
}
