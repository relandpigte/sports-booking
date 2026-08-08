import type { Role } from "@prisma/client";

export const RECENT_MFA_MINUTES = 15;

export function partnerMfaEnforcedAt(): Date | null {
  const configured = process.env.PARTNER_MFA_REQUIRED_AFTER?.trim();
  if (!configured) return null;
  const parsed = new Date(configured);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function roleRequiresMfa(role: Role, now = new Date()): boolean {
  if (role === "ADMIN") return true;
  if (role !== "PARTNER") return false;

  const enforcedAt = partnerMfaEnforcedAt();
  return enforcedAt !== null && now >= enforcedAt;
}
