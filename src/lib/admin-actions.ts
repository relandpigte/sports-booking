"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { normalizeAvatar } from "@/lib/avatar";
import { ROLE_VALUES } from "@/lib/constants";
import {
  emailDeliveryConfigured,
  sendPartnerApprovalEmail,
} from "@/lib/email";
import { appUrl } from "@/lib/urls";
import { firstErrors } from "@/lib/zod-errors";
import {
  AdminCreateUserSchema,
  AdminUpdateUserSchema,
} from "@/lib/validation";
import { isPartnerImpersonationActive } from "@/lib/impersonation";

export type AdminFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}

export async function createUserAction(
  _prev: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) {
    return {
      message:
        "Exit assisted partner access before changing account profile details.",
    };
  }

  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    password: String(formData.get("password") ?? ""),
    playerName: String(formData.get("playerName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? ""),
  };
  const values = {
    name: raw.name,
    email: raw.email,
    role: raw.role,
    playerName: raw.playerName,
    phone: raw.phone,
    skillLevel: raw.skillLevel,
  };

  const parsed = AdminCreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    return {
      errors: { email: "An account with this email already exists" },
      values,
    };
  }

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) {
    return { errors: { image: avatar.error }, values };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role as Role,
      partnerStatus: data.role === "PARTNER" ? "ACTIVE" : null,
      partnerActivatedAt: data.role === "PARTNER" ? new Date() : null,
      partnerActivatedById: data.role === "PARTNER" ? admin.id : null,
      playerName: data.playerName,
      phone: data.phone,
      skillLevel: data.skillLevel,
      image: avatar.value,
      passwordHash,
    },
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function updateUserAction(
  _prev: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) {
    return {
      message:
        "Exit assisted partner access before changing account profile details.",
    };
  }

  const raw = {
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    playerName: String(formData.get("playerName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    skillLevel: String(formData.get("skillLevel") ?? ""),
    privateProfile: formData.get("privateProfile") === "on",
  };
  const values = {
    name: raw.name,
    role: raw.role,
    playerName: raw.playerName,
    phone: raw.phone,
    skillLevel: raw.skillLevel,
  };

  const parsed = AdminUpdateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }

  const data = parsed.data;
  const existingUser = await prisma.user.findUnique({
    where: { id: data.id },
    select: { role: true },
  });
  if (!existingUser) return { message: "User not found.", values };

  // Prevent an admin from demoting their own account (avoids self lock-out).
  if (data.id === admin?.id && data.role !== "ADMIN") {
    return {
      errors: { role: "You can't change your own role" },
      values,
    };
  }

  const avatar = normalizeAvatar(String(formData.get("image") ?? ""));
  if (avatar.error) {
    return { errors: { image: avatar.error }, values };
  }

  await prisma.user.update({
    where: { id: data.id },
    data: {
      name: data.name,
      role: data.role as Role,
      sessionVersion:
        existingUser.role !== data.role ? { increment: 1 } : undefined,
      ...(data.role === "PARTNER" && existingUser.role !== "PARTNER"
        ? {
            partnerStatus: "PENDING",
            partnerActivatedAt: null,
            partnerActivatedById: null,
          }
        : data.role === "PARTNER"
          ? {}
        : {
            partnerStatus: null,
            partnerActivatedAt: null,
            partnerActivatedById: null,
          }),
      playerName: data.playerName ?? null,
      phone: data.phone ?? null,
      skillLevel: data.skillLevel,
      privateProfile: data.privateProfile,
      image: avatar.value,
    },
  });
  if (existingUser.role !== data.role) {
    await prisma.$transaction([
      prisma.authSession.updateMany({
        where: { userId: data.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.securityEvent.create({
        data: {
          userId: data.id,
          type: "ROLE_CHANGED",
          metadata: { from: existingUser.role, to: data.role },
        },
      }),
    ]);
  }

  revalidatePath("/users");
  redirect("/users");
}

export async function setUserRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!id || !isRole(role)) return;
  // Don't let an admin change their own role from the list.
  if (id === admin?.id) return;

  const current = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!current) return;

  await prisma.user.update({
    where: { id },
    data: {
      role,
      sessionVersion: current.role !== role ? { increment: 1 } : undefined,
      ...(role === "PARTNER" && current.role !== "PARTNER"
        ? { partnerStatus: "PENDING" }
        : role !== "PARTNER"
          ? {
            partnerStatus: null,
            partnerActivatedAt: null,
            partnerActivatedById: null,
            }
          : {}),
    },
  });
  if (current.role !== role) {
    await prisma.$transaction([
      prisma.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.securityEvent.create({
        data: {
          userId: id,
          type: "ROLE_CHANGED",
          metadata: { from: current.role, to: role },
        },
      }),
    ]);
  }
  revalidatePath("/users");
}

export async function setPartnerActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const partner = await prisma.user.findFirst({
    where: { id, role: "PARTNER" },
    select: {
      id: true,
      email: true,
      name: true,
      playerName: true,
      hubs: { select: { name: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!partner) return;

  const transition = await prisma.user.updateMany({
    where: {
      id,
      role: "PARTNER",
      ...(active
        ? {
            OR: [
              { partnerStatus: null },
              { partnerStatus: { not: "ACTIVE" } },
            ],
          }
        : {}),
    },
    data: active
      ? {
          partnerStatus: "ACTIVE",
          partnerActivatedAt: new Date(),
          partnerActivatedById: admin.id,
        }
      : {
          partnerStatus: "PENDING",
          partnerActivatedAt: null,
          partnerActivatedById: null,
        },
  });

  if (active && transition.count === 1 && emailDeliveryConfigured()) {
    try {
      await sendPartnerApprovalEmail({
        to: partner.email,
        name: partner.playerName ?? partner.name ?? "there",
        venueName: partner.hubs[0]?.name ?? partner.name ?? "Your venue",
        actionUrl: appUrl("/dashboard/partner"),
        idempotencyKey: `partner-approved-${partner.id}`,
      });
    } catch (error) {
      // Approval is the source of truth. A provider outage must not leave a
      // reviewed venue stuck in pending status.
      console.error(
        "Partner-approval email delivery failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  revalidatePath("/users");
  revalidatePath(`/users/${id}/edit`);
  revalidatePath("/hubs");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) return;
  const id = String(formData.get("userId") ?? "");

  if (!id) return;
  // Don't let an admin delete their own account.
  if (id === admin?.id) return;

  await prisma.user.delete({ where: { id } });
  revalidatePath("/users");
}
