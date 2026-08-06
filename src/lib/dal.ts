import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActivePartnerImpersonation } from "@/lib/impersonation";
import { validateManagedSession } from "@/lib/account-security";
import { isIncompleteGoogleRegistration } from "@/lib/registration-state";

const currentUserSelect = {
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

const getValidatedSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      sessionVersion: true,
      role: true,
      mfaEnabledAt: true,
      registrationCompletedAt: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (
    !current ||
    current.sessionVersion !== session.user.sessionVersion ||
    (current.role === "ADMIN" &&
      (!current.mfaEnabledAt || !session.user.mfaVerified))
  ) {
    return null;
  }
  if (isIncompleteGoogleRegistration(current)) {
    return { session, managedSession: null, registrationIncomplete: true };
  }
  const managedSession = await validateManagedSession({
    userId: session.user.id,
    sessionId: session.user.sessionId,
  });
  if (!managedSession) return null;
  return { session, managedSession, registrationIncomplete: false };
});

// Verifies there is an authenticated session, redirecting to /login otherwise.
// Memoized per render pass so repeated calls don't re-run the check.
export const verifySession = cache(async () => {
  const validated = await getValidatedSession();
  if (!validated) {
    redirect("/login");
  }
  if (validated.registrationIncomplete) {
    redirect("/register/google");
  }
  if (!validated.managedSession) redirect("/login");
  return {
    userId: validated.session.user.id,
    sessionId: validated.session.user.sessionId,
    sessionDatabaseId: validated.managedSession.id,
  };
});

// Like getCurrentUser, but does NOT redirect when signed out — returns null
// instead. Public pages (e.g. a hub profile) render differently for a signed-in
// player but must not bounce anonymous visitors to /login.
export const getViewer = cache(async () => {
  const validated = await getValidatedSession();
  if (!validated || validated.registrationIncomplete || !validated.managedSession) {
    return null;
  }
  const { session } = validated;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    // email/image are here so public pages can render the signed-in shell
    // (sidebar + account footer) without a second query.
    select: {
      id: true,
      name: true,
      playerName: true,
      email: true,
      image: true,
      role: true,
      partnerStatus: true,
      sessionVersion: true,
    },
  });
  if (!user || user.sessionVersion !== session.user.sessionVersion) {
    return null;
  }

  if (user.role === "ADMIN") {
    const impersonation = await getActivePartnerImpersonation(user.id);
    if (impersonation) {
      const partner = impersonation.partner;
      return {
        id: partner.id,
        name: partner.name,
        playerName: partner.playerName,
        email: partner.email,
        image: partner.image,
        role: partner.role,
        partnerStatus: partner.partnerStatus,
      };
    }
  }

  const { sessionVersion: _sessionVersion, ...viewer } = user;
  return viewer;
});

// The real signed-in account, never the assisted partner. Admin authorization,
// impersonation controls, and security-sensitive account actions use this.
export const getAuthenticatedUser = cache(async () => {
  const validated = await getValidatedSession();
  if (!validated || validated.registrationIncomplete || !validated.managedSession) {
    return null;
  }
  const { session } = validated;
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { ...currentUserSelect, sessionVersion: true },
  });
  if (!row || row.sessionVersion !== session.user.sessionVersion) {
    return null;
  }
  const { sessionVersion: _sessionVersion, ...user } = row;
  return user;
});

// Returns the effective workspace user. During assisted setup this is the
// partner, while getAuthenticatedUser remains the real admin.
export const getCurrentUser = cache(async () => {
  await verifySession();
  const user = await getAuthenticatedUser();
  if (!user) return null;
  if (user.role !== "ADMIN") return user;

  const impersonation = await getActivePartnerImpersonation(user.id);
  return impersonation?.partner ?? user;
});

// Guards a page/action by role. Redirects to /login if the signed-in user
// doesn't hold one of the allowed roles.
export const requireRole = cache(async (...allowed: Role[]) => {
  const user = await getCurrentUser();
  if (!user || !allowed.includes(user.role)) {
    redirect("/login");
  }
  return user;
});

// Redirects to /dashboard rather than /login: the visitor is signed in, they
// just aren't a partner.
export async function requirePartner() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARTNER") {
    redirect("/dashboard");
  }
  return user;
}

// Partner capabilities stay locked until an admin has verified the business.
// Pending partners can still sign in and view their dashboard/account.
export async function requireActivePartner() {
  const user = await requirePartner();
  if (user.partnerStatus !== "ACTIVE") {
    const actor = await getAuthenticatedUser();
    const impersonation =
      actor?.role === "ADMIN"
        ? await getActivePartnerImpersonation(actor.id)
        : null;
    // Admins may finish setup before approval. Public listing and payments
    // still use the partner's real status, so this does not activate the venue.
    if (impersonation?.partner.id === user.id) return user;
    redirect("/dashboard/partner");
  }
  return user;
}
