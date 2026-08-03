import "server-only";

import { prisma } from "@/lib/db";

// Record only successful authentications. Both values are updated by one SQL
// statement, so concurrent logins cannot lose increments.
export async function recordSuccessfulLogin(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      loginCount: { increment: 1 },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      sessionVersion: true,
      lastLoginAt: true,
      loginCount: true,
    },
  });
}
