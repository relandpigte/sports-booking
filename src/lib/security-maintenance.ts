import "server-only";

import { prisma } from "@/lib/db";

const DAY_MS = 86_400_000;

export async function cleanupExpiredSecurityRows(now = new Date()) {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
  const oneYearAgo = new Date(now.getTime() - 365 * DAY_MS);

  const [grants, challenges, sessions, resetTokens, throttles, events] =
    await prisma.$transaction([
      prisma.authGrant.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: sevenDaysAgo } },
            { consumedAt: { lt: sevenDaysAgo } },
          ],
        },
      }),
      prisma.securityChallenge.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: sevenDaysAgo } },
            { consumedAt: { lt: sevenDaysAgo } },
          ],
        },
      }),
      prisma.authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: ninetyDaysAgo } },
            { revokedAt: { lt: ninetyDaysAgo } },
          ],
        },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: sevenDaysAgo } },
      }),
      prisma.loginThrottle.deleteMany({
        where: {
          updatedAt: { lt: sevenDaysAgo },
          OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
        },
      }),
      prisma.securityEvent.deleteMany({
        where: { createdAt: { lt: oneYearAgo } },
      }),
    ]);

  return {
    grants: grants.count,
    challenges: challenges.count,
    sessions: sessions.count,
    resetTokens: resetTokens.count,
    throttles: throttles.count,
    events: events.count,
  };
}
