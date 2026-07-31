import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Verifies there is an authenticated session, redirecting to /login otherwise.
// Memoized per render pass so repeated calls don't re-run the check.
export const verifySession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { sessionVersion: true },
  });
  if (
    !current ||
    current.sessionVersion !== session.user.sessionVersion
  ) {
    redirect("/login");
  }
  return { userId: session.user.id };
});

// Like getCurrentUser, but does NOT redirect when signed out — returns null
// instead. Public pages (e.g. a hub profile) render differently for a signed-in
// player but must not bounce anonymous visitors to /login.
export const getViewer = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
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

  const { sessionVersion: _sessionVersion, ...viewer } = user;
  return viewer;
});

// Returns the current user's profile (only the fields the UI needs).
export const getCurrentUser = cache(async () => {
  const { userId } = await verifySession();
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
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
    },
  });
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
    redirect("/dashboard/partner");
  }
  return user;
}
