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
import { STAFF_WORKSPACE_COOKIE } from "@/lib/staffing-shared";
import { currentUserSelect } from "@/lib/user-select";

export {
  hashImpersonationToken,
  PARTNER_IMPERSONATION_COOKIE,
  PARTNER_IMPERSONATION_MINUTES,
} from "@/lib/impersonation-token";

export type AssistedUser = Prisma.UserGetPayload<{
  select: typeof currentUserSelect;
}>;

// An admin assisting another account. Any non-admin user can be assisted:
// partners, players (including trainers and staff members).
export type ImpersonationContext = {
  sessionId: string;
  startedAt: Date;
  expiresAt: Date;
  admin: { id: string; name: string | null; email: string };
  user: AssistedUser;
};

export const getActiveImpersonation = cache(
  async (adminId: string): Promise<ImpersonationContext | null> => {
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
        assistedUserId: true,
        startedAt: true,
        expiresAt: true,
      },
    });
    if (!session) return null;

    const [admin, user] = await Promise.all([
      prisma.user.findFirst({
        where: { id: session.adminId, role: "ADMIN" },
        select: { id: true, name: true, email: true },
      }),
      // Admins are never assistable, even if a role changed mid-session.
      prisma.user.findFirst({
        where: { id: session.assistedUserId, role: { not: "ADMIN" } },
        select: currentUserSelect,
      }),
    ]);
    if (!admin || !user) return null;

    return {
      sessionId: session.id,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      admin,
      user,
    };
  }
);

export async function getCurrentImpersonation(): Promise<ImpersonationContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getActiveImpersonation(session.user.id);
}

export async function isImpersonationActive(): Promise<boolean> {
  return Boolean(await getCurrentImpersonation());
}

// Returns the account a workspace mutation is allowed to change. A normal
// session may only mutate itself; an ADMIN in an active assisted session may
// mutate only that session's user. Server Actions use this instead of a
// client-supplied target id so the cookie-backed assistance session remains
// the authorization boundary.
export async function getWorkspaceMutationTarget(): Promise<{
  userId: string;
  assisted: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  const context = await getActiveImpersonation(session.user.id);
  return context
    ? { userId: context.user.id, assisted: true }
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
  const context = await getCurrentImpersonation();
  if (!context) return;

  await prisma.$transaction([
    prisma.partnerImpersonationAudit.create({
      data: {
        sessionId: context.sessionId,
        adminId: context.admin.id,
        assistedUserId: context.user.id,
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

// Clears the cookies an assist session leaves behind. The staff-workspace
// selection belongs to whoever was being assisted, so it must not carry over.
export async function clearImpersonationCookies(): Promise<void> {
  const store = await cookies();
  store.delete(PARTNER_IMPERSONATION_COOKIE);
  store.delete(STAFF_WORKSPACE_COOKIE);
}

export async function endImpersonationForLogout(): Promise<void> {
  const context = await getCurrentImpersonation();
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
          assistedUserId: context.user.id,
          action: "SESSION_ENDED",
          metadata: { reason: "LOGOUT" },
        },
      }),
    ]);
    await clearImpersonationCookies();
    return;
  }
  (await cookies()).delete(PARTNER_IMPERSONATION_COOKIE);
}

// Admins may change an assisted user's payment settings, but never pay, start
// a checkout, or submit a payment or receipt on their behalf.
export const ASSISTED_PAYMENT_BLOCKED =
  "Payments can't be made while assisting a user.";
