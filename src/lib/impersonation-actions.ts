"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendPartnerAssistanceEmail } from "@/lib/email";
import {
  getActivePartnerImpersonation,
  hashImpersonationToken,
  PARTNER_IMPERSONATION_COOKIE,
  PARTNER_IMPERSONATION_MINUTES,
} from "@/lib/impersonation";
import { appUrl } from "@/lib/urls";

export async function startPartnerImpersonationAction(formData: FormData) {
  const admin = await requireAdmin();
  const partnerId = String(formData.get("partnerId") ?? "");
  const partner = await prisma.user.findFirst({
    where: { id: partnerId, role: "PARTNER" },
    select: { id: true, name: true, email: true },
  });
  if (!partner) redirect("/users?role=PARTNER");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + PARTNER_IMPERSONATION_MINUTES * 60_000
  );
  const impersonation = await prisma.$transaction(async (tx) => {
    const replaced = await tx.partnerImpersonationSession.findMany({
      where: { adminId: admin.id, endedAt: null },
      select: { id: true, partnerId: true },
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
          partnerId: session.partnerId,
          action: "SESSION_ENDED",
          metadata: { reason: "REPLACED" },
        })),
      });
    }
    const created = await tx.partnerImpersonationSession.create({
      data: {
        tokenHash: hashImpersonationToken(token),
        adminId: admin.id,
        partnerId: partner.id,
        expiresAt,
      },
      select: { id: true },
    });
    await tx.partnerImpersonationAudit.create({
      data: {
        sessionId: created.id,
        adminId: admin.id,
        partnerId: partner.id,
        action: "SESSION_STARTED",
      },
    });
    return created;
  });

  (await cookies()).set(PARTNER_IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    maxAge: PARTNER_IMPERSONATION_MINUTES * 60,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    priority: "high",
  });

  if (emailDeliveryConfigured()) {
    try {
      await sendPartnerAssistanceEmail({
        to: partner.email,
        name: partner.name ?? "there",
        adminName: admin.name ?? admin.email,
        expiresAt,
        actionUrl: appUrl("/dashboard/partner"),
        idempotencyKey: `partner-assistance-${impersonation.id}`,
      });
    } catch (error) {
      console.error(
        "Partner-assistance email delivery failed:",
        error instanceof Error ? error.message : "Unknown provider error"
      );
    }
  }

  redirect("/dashboard/partner");
}

export async function stopPartnerImpersonationAction() {
  const admin = await requireAdmin();
  const context = await getActivePartnerImpersonation(admin.id);
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
          partnerId: context.partner.id,
          action: "SESSION_ENDED",
          metadata: { reason: "ADMIN_EXIT" },
        },
      }),
    ]);
  }
  (await cookies()).delete(PARTNER_IMPERSONATION_COOKIE);
  redirect("/dashboard/admin");
}
