"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { normalizeAvatar } from "@/lib/avatar";
import { ROLE_VALUES } from "@/lib/constants";
import { firstErrors } from "@/lib/zod-errors";
import {
  AdminCreateUserSchema,
  AdminUpdateUserSchema,
} from "@/lib/validation";

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
  await requireAdmin();

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
      playerName: data.playerName ?? null,
      phone: data.phone ?? null,
      skillLevel: data.skillLevel,
      privateProfile: data.privateProfile,
      image: avatar.value,
    },
  });

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

  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/users");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("userId") ?? "");

  if (!id) return;
  // Don't let an admin delete their own account.
  if (id === admin?.id) return;

  await prisma.user.delete({ where: { id } });
  revalidatePath("/users");
}
