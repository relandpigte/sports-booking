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

// Whether a sensitive financial action must re-check the second factor
// (requireRecentMfa). Admins never are: every admin session already passed
// MFA at sign-in, including while assisting another account.
export function requiresRecentMfa(
  role: Role,
  mfaEnabledAt: Date | null,
  now = new Date()
): boolean {
  if (role === "ADMIN") return false;
  return roleRequiresMfa(role, now) || mfaEnabledAt !== null;
}
