import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  hashImpersonationToken,
  PARTNER_IMPERSONATION_COOKIE,
} from "@/lib/impersonation-token";

export {
  hashImpersonationToken,
  PARTNER_IMPERSONATION_COOKIE,
  PARTNER_IMPERSONATION_MINUTES,
} from "@/lib/impersonation-token";

const assistedPartnerSelect = {
  id: true,
  name: true,
  playerName: true,
  email: true,
  phone: true,
  facebookPage: true,
  image: true,
  role: true,
  partnerStatus: true,
  skillLevel: true,
  privateProfile: true,
} as const;

export type AssistedPartner = Prisma.UserGetPayload<{
  select: typeof assistedPartnerSelect;
}>;

export type PartnerImpersonationContext = {
  sessionId: string;
  startedAt: Date;
  expiresAt: Date;
  admin: { id: string; name: string | null; email: string };
  partner: AssistedPartner;
};

export const getActivePartnerImpersonation = cache(
  async (adminId: string): Promise<PartnerImpersonationContext | null> => {
    const token = (await cookies()).get(PARTNER_IMPERSONATION_COOKIE)?.value;
    if (!token || token.length < 32 || token.length > 200) return null;

    const session = await prisma.partnerImpersonationSession.findFirst({
      where: {
        tokenHash: hashImpersonationToken(token),
        adminId,
        endedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        adminId: true,
        partnerId: true,
        startedAt: true,
        expiresAt: true,
      },
    });
    if (!session) return null;

    const [admin, partner] = await Promise.all([
      prisma.user.findFirst({
        where: { id: session.adminId, role: "ADMIN" },
        select: { id: true, name: true, email: true },
      }),
      prisma.user.findFirst({
        where: { id: session.partnerId, role: "PARTNER" },
        select: assistedPartnerSelect,
      }),
    ]);
    if (!admin || !partner) return null;

    return {
      sessionId: session.id,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      admin,
      partner,
    };
  }
);

export async function getCurrentPartnerImpersonation(): Promise<PartnerImpersonationContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getActivePartnerImpersonation(session.user.id);
}

export async function isPartnerImpersonationActive(): Promise<boolean> {
  return Boolean(await getCurrentPartnerImpersonation());
}

// Returns the account a workspace mutation is allowed to change. A normal
// session may only mutate itself; an ADMIN in an active assisted session may
// mutate only that session's partner. Server Actions use this instead of a
// client-supplied target id so the cookie-backed assistance session remains
// the authorization boundary.
export async function getWorkspaceMutationTarget(): Promise<{
  userId: string;
  assisted: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const context = await getActivePartnerImpersonation(session.user.id);
  return context
    ? { userId: context.partner.id, assisted: true }
    : { userId: session.user.id, assisted: false };
}

export async function recordImpersonatedAction({
  action,
  targetType,
  targetId,
  metadata,
}: {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  const context = await getCurrentPartnerImpersonation();
  if (!context) return;

  await prisma.$transaction([
    prisma.partnerImpersonationAudit.create({
      data: {
        sessionId: context.sessionId,
        adminId: context.admin.id,
        partnerId: context.partner.id,
        action,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        metadata,
      },
    }),
    prisma.partnerImpersonationSession.update({
      where: { id: context.sessionId },
      data: { lastActionAt: new Date() },
    }),
  ]);
}

export async function endImpersonationForLogout(): Promise<void> {
  const context = await getCurrentPartnerImpersonation();
  if (context) {
    await prisma.$transaction([
      prisma.partnerImpersonationSession.update({
        where: { id: context.sessionId },
        data: { endedAt: new Date(), endedReason: "LOGOUT" },
      }),
      prisma.partnerImpersonationAudit.create({
        data: {
          sessionId: context.sessionId,
          adminId: context.admin.id,
          partnerId: context.partner.id,
          action: "SESSION_ENDED",
          metadata: { reason: "LOGOUT" },
        },
      }),
    ]);
  }
  (await cookies()).delete(PARTNER_IMPERSONATION_COOKIE);
}
