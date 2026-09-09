import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { hashSecurityToken } from "@/lib/security-context";
import type { PartnerWorkspace, StaffPermissions } from "@/lib/staffing";

export const GUEST_BUNALQ_COOKIE = "bunal_guest_organizer";
export const GUEST_BUNALQ_SESSION_MS = 30 * 24 * 60 * 60_000;

const guestPermissions: StaffPermissions = {
  hubs: "NONE",
  bookings: "NONE",
  events: "NONE",
  reports: "NONE",
  messages: "NONE",
  payments: "NONE",
  openPlay: "MANAGE",
};

export type GuestBunalQWorkspace = PartnerWorkspace & {
  guestOrganizer: true;
  organizerSessionId: string;
  credentialToken: string;
};

export type OpenPlayWorkspace = PartnerWorkspace | GuestBunalQWorkspace;

export function createGuestBunalQCredential() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashSecurityToken(rawToken),
    expiresAt: new Date(Date.now() + GUEST_BUNALQ_SESSION_MS),
  };
}

export async function setGuestBunalQOrganizerCookie(
  rawToken: string,
  expiresAt: Date
) {
  (await cookies()).set(GUEST_BUNALQ_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function getGuestBunalQWorkspace(): Promise<GuestBunalQWorkspace | null> {
  let rawToken: string | undefined;
  try {
    rawToken = (await cookies()).get(GUEST_BUNALQ_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!rawToken) return null;

  const organizer = await prisma.guestBunalQOrganizerSession.findFirst({
    where: {
      tokenHash: hashSecurityToken(rawToken),
      expiresAt: { gt: new Date() },
      user: { isGuestBunalQOrganizer: true },
    },
    select: { id: true, userId: true },
  });
  if (!organizer) return null;

  return {
    kind: "OWNER",
    actorId: organizer.userId,
    partnerId: organizer.userId,
    partnerName: "Guest organizer",
    membershipId: null,
    permissions: guestPermissions,
    guestOrganizer: true,
    organizerSessionId: organizer.id,
    credentialToken: rawToken,
  };
}

export async function refreshGuestBunalQWorkspace(
  workspace: GuestBunalQWorkspace
) {
  const expiresAt = new Date(Date.now() + GUEST_BUNALQ_SESSION_MS);
  await prisma.guestBunalQOrganizerSession.update({
    where: { id: workspace.organizerSessionId },
    data: { expiresAt, lastSeenAt: new Date() },
  });
  await setGuestBunalQOrganizerCookie(workspace.credentialToken, expiresAt);
}

export function isGuestBunalQWorkspace(
  workspace: OpenPlayWorkspace
): workspace is GuestBunalQWorkspace {
  return "guestOrganizer" in workspace && workspace.guestOrganizer;
}
