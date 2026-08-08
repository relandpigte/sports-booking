import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hashSecurityToken } from "@/lib/security-context";

export type RateLimitRule = {
  namespace: string;
  subject: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
};

// Uses the existing hashed throttle table. The UPSERT is one statement so
// concurrent requests cannot race through a read-then-write limiter.
export async function consumeRateLimit(rule: RateLimitRule): Promise<boolean> {
  const now = new Date();
  const windowStartedAfter = new Date(now.getTime() - rule.windowSeconds * 1000);
  const blockedUntil = new Date(
    now.getTime() + (rule.blockSeconds ?? rule.windowSeconds) * 1000
  );
  const keyHash = hashSecurityToken(
    `rate-limit:${rule.namespace}:${rule.subject}`
  );
  const rows = await prisma.$queryRaw<
    Array<{ attempts: number; blockedUntil: Date | null }>
  >(Prisma.sql`
    INSERT INTO "LoginThrottle"
      ("keyHash", "attempts", "windowStartedAt", "blockedUntil", "updatedAt")
    VALUES
      (${keyHash}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attempts" = CASE
        WHEN "LoginThrottle"."windowStartedAt" < ${windowStartedAfter} THEN 1
        ELSE "LoginThrottle"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "LoginThrottle"."windowStartedAt" < ${windowStartedAfter} THEN ${now}
        ELSE "LoginThrottle"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN "LoginThrottle"."blockedUntil" > ${now}
          THEN "LoginThrottle"."blockedUntil"
        WHEN "LoginThrottle"."windowStartedAt" < ${windowStartedAfter}
          THEN NULL
        WHEN "LoginThrottle"."attempts" + 1 > ${rule.limit}
          THEN ${blockedUntil}
        ELSE NULL
      END,
      "updatedAt" = ${now}
    RETURNING "attempts", "blockedUntil"
  `);
  return !(rows[0]?.blockedUntil && rows[0].blockedUntil > now);
}
