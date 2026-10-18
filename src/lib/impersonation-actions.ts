"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { dashboardHomeFor } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import {
  clearImpersonationCookies,
  getActiveImpersonation,
  hashImpersonationToken,
  PARTNER_IMPERSONATION_COOKIE,
  PARTNER_IMPERSONATION_MINUTES,
} from "@/lib/impersonation";
import { STAFF_WORKSPACE_COOKIE } from "@/lib/staffing-shared";

// Starts an audited assist session for any non-admin account.
export async function startImpersonationAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const target = await prisma.user.findFirst({
    where: { id: userId, role: { not: "ADMIN" } },
    select: { id: true, role: true },
  });
  if (!target) redirect("/users");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + PARTNER_IMPERSONATION_MINUTES * 60_000
  );
  await prisma.$transaction(async (tx) => {
    const replaced = await tx.partnerImpersonationSession.findMany({
      where: { adminId: admin.id, endedAt: null },
      select: { id: true, assistedUserId: true },
    });
    await tx.partnerImpersonationSession.updateMany({
      where: { adminId: admin.id, endedAt: null },
      data: { endedAt: new Date(), endedReason: "REPLACED" },
    });
    if (replaced.length > 0) {
      await tx.partnerImpersonationAudit.createMany({
        data: replaced.map((session) => ({
          sessionId: session.id,
          adminId: admin.id,
          assistedUserId: session.assistedUserId,
          action: "SESSION_ENDED",
          metadata: { reason: "REPLACED" },
        })),
      });
    }
    const created = await tx.partnerImpersonationSession.create({
      data: {
        tokenHash: hashImpersonationToken(token),
        adminId: admin.id,
        assistedUserId: target.id,
        expiresAt,
      },
      select: { id: true },
    });
    await tx.partnerImpersonationAudit.create({
      data: {
        sessionId: created.id,
        adminId: admin.id,
        assistedUserId: target.id,
        action: "SESSION_STARTED",
        metadata: { role: target.role },
      },
    });
    return created;
  });

  const store = await cookies();
  store.set(PARTNER_IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    maxAge: PARTNER_IMPERSONATION_MINUTES * 60,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });
  // Start in the assisted user's personal workspace; a staff member's
  // workspace is entered explicitly, as they would themselves.
  store.delete(STAFF_WORKSPACE_COOKIE);

  redirect(dashboardHomeFor(target.role));
}

export async function stopImpersonationAction() {
  const admin = await requireAdmin();
  const context = await getActiveImpersonation(admin.id);
  if (context) {
    await prisma.$transaction([
      prisma.partnerImpersonationSession.update({
        where: { id: context.sessionId },
        data: { endedAt: new Date(), endedReason: "ADMIN_EXIT" },
      }),
      prisma.partnerImpersonationAudit.create({
        data: {
          sessionId: context.sessionId,
          adminId: admin.id,
          assistedUserId: context.user.id,
          action: "SESSION_ENDED",
          metadata: { reason: "ADMIN_EXIT" },
        },
      }),
    ]);
  }
  await clearImpersonationCookies();
  redirect("/dashboard/admin");
}
