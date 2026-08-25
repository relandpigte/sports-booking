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
  PartnerApplicationSchema,
} from "@/lib/validation";
import { isPartnerImpersonationActive } from "@/lib/impersonation";

export type AdminFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

export type DeleteUserState = {
  message?: string;
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

  const avatar = await normalizeAvatar(String(formData.get("image") ?? ""));
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

  const avatar = await normalizeAvatar(String(formData.get("image") ?? ""));
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
      phone: true,
      facebookPage: true,
      partnerStatus: true,
      hubs: { select: { name: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!partner) return;
  const wasDeactivated = partner.partnerStatus === "DEACTIVATED";

  if (active) {
    const firstHub = await prisma.hub.findFirst({
      where: { ownerId: partner.id },
      orderBy: { createdAt: "asc" },
      select: {
        name: true,
        slug: true,
        about: true,
        phone: true,
        email: true,
        address: true,
        games: true,
      },
    });
    const complete =
      (partner.partnerStatus === "PENDING" ||
        partner.partnerStatus === "DEACTIVATED" ||
        partner.partnerStatus === null) &&
      firstHub &&
      PartnerApplicationSchema.safeParse({
        fullName: partner.playerName ?? "",
        phone: partner.phone ?? "",
        hubName: firstHub.name,
        slug: firstHub.slug ?? "",
        hubAbout: firstHub.about ?? "",
        hubPhone: firstHub.phone ?? "",
        hubEmail: firstHub.email ?? "",
        address: firstHub.address ?? "",
        games: firstHub.games,
        facebookPage: partner.facebookPage ?? "",
      }).success;
    if (!complete) return;
  }

  const transition = await prisma.user.updateMany({
    where: {
      id,
      role: "PARTNER",
      ...(active
        ? {
            OR: [
              { partnerStatus: "PENDING" as const },
              { partnerStatus: "DEACTIVATED" as const },
              { partnerStatus: null },
            ],
          }
        : { partnerStatus: "ACTIVE" as const }),
    },
    data: active
      ? {
          partnerStatus: "ACTIVE",
          partnerActivatedAt: new Date(),
          partnerActivatedById: admin.id,
        }
      : {
          partnerStatus: "DEACTIVATED",
          partnerActivatedAt: null,
          partnerActivatedById: null,
        },
  });

  if (
    active &&
    !wasDeactivated &&
    transition.count === 1 &&
    emailDeliveryConfigured()
  ) {
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

export async function deleteUserAction(
  _prev: DeleteUserState,
  formData: FormData
): Promise<DeleteUserState> {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) {
    return {
      message: "Exit assisted partner access before deleting an account.",
    };
  }
  const id = String(formData.get("userId") ?? "");

  if (!id) return { message: "User not found." };
  // Don't let an admin delete their own account.
  if (id === admin.id) {
    return { message: "You cannot delete your own administrator account." };
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: {
          role: true,
          partnerStatus: true,
          partnerGateway: { select: { id: true } },
          trainerProfile: { select: { status: true } },
          trainerGateway: { select: { id: true } },
          _count: {
            select: {
              hubs: true,
              bookings: true,
              bookingPayments: true,
              venuePayments: true,
              eventRegistrations: true,
              organizerEventGuests: true,
              manualPaymentMethods: true,
              serviceFeeEntries: true,
              serviceFeeSettlements: true,
              serviceFeeWaivers: true,
              serviceFeeWaiversGranted: true,
              serviceFeeWaiversReversed: true,
              trainerManualMethods: true,
              trainerSessionsBooked: true,
              trainerPaymentsMade: true,
              trainerPaymentsReceived: true,
              trainerFeeEntries: true,
              trainerFeeSettlements: true,
              trainerFeeWaivers: true,
              trainerFeeWaiversGranted: true,
              trainerFeeWaiversReversed: true,
            },
          },
        },
      });
      if (!user) return { message: "User not found." };

      if (user.trainerProfile?.status === "ACTIVE") {
        return { message: "Deactivate this trainer profile before deleting the account." };
      }
      const hasTrainerHistory = user.trainerGateway !== null || user._count.trainerManualMethods > 0 || user._count.trainerSessionsBooked > 0 || user._count.trainerPaymentsMade > 0 || user._count.trainerPaymentsReceived > 0 || user._count.trainerFeeEntries > 0 || user._count.trainerFeeSettlements > 0 || user._count.trainerFeeWaivers > 0 || user._count.trainerFeeWaiversGranted > 0 || user._count.trainerFeeWaiversReversed > 0;
      if (hasTrainerHistory) {
        return { message: "This account has trainer session, payment, or settlement history and cannot be permanently deleted." };
      }

      if (user.role === "PARTNER") {
        if (user.partnerStatus === "ACTIVE") {
          return {
            message: "Deactivate this partner before deleting the account.",
          };
        }
        const hasPartnerOwnedHistory =
          user.partnerGateway !== null ||
          user._count.hubs > 0 ||
          user._count.venuePayments > 0 ||
          user._count.organizerEventGuests > 0 ||
          user._count.manualPaymentMethods > 0 ||
          user._count.serviceFeeEntries > 0 ||
          user._count.serviceFeeSettlements > 0 ||
          user._count.serviceFeeWaivers > 0 ||
          user._count.serviceFeeWaiversGranted > 0 ||
          user._count.serviceFeeWaiversReversed > 0;
        const hasPartnerAccountHistory =
          hasPartnerOwnedHistory ||
          user._count.bookings > 0 ||
          user._count.bookingPayments > 0 ||
          user._count.eventRegistrations > 0;
        if (hasPartnerOwnedHistory || hasPartnerAccountHistory) {
          return {
            message:
              "This partner has venue, booking, payment, or settlement history and cannot be permanently deleted. Keep the account deactivated instead.",
          };
        }
      } else {
        const hasPartnerOwnedHistory =
          user.partnerGateway !== null ||
          user._count.hubs > 0 ||
          user._count.venuePayments > 0 ||
          user._count.organizerEventGuests > 0 ||
          user._count.manualPaymentMethods > 0 ||
          user._count.serviceFeeEntries > 0 ||
          user._count.serviceFeeSettlements > 0 ||
          user._count.serviceFeeWaivers > 0 ||
          user._count.serviceFeeWaiversGranted > 0 ||
          user._count.serviceFeeWaiversReversed > 0;
        if (hasPartnerOwnedHistory) {
          return {
            message:
              "This account still owns partner venue or financial history and cannot be permanently deleted.",
          };
        }
      }

      await tx.user.delete({ where: { id } });
      return {};
    },
    { isolationLevel: "Serializable" }
  );
  if (result.message) return result;
  revalidatePath("/users");
  return {};
}
