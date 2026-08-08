import type { Role } from "@prisma/client";

export const RECENT_MFA_MINUTES = 15;

export function partnerMfaEnforcedAt(): Date {
  const configured = process.env.PARTNER_MFA_REQUIRED_AFTER?.trim();
  if (!configured) return new Date(0);
  const parsed = new Date(configured);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function roleRequiresMfa(role: Role, now = new Date()): boolean {
  return role === "ADMIN" ||
    (role === "PARTNER" && now >= partnerMfaEnforcedAt());
}
