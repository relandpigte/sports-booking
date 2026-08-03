import { createHash } from "node:crypto";

export const PARTNER_IMPERSONATION_COOKIE = "bunal_partner_assistance";
export const PARTNER_IMPERSONATION_MINUTES = 30;

export function hashImpersonationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
