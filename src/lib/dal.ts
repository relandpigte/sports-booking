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
  return { userId: session.user.id };
});

// Like getCurrentUser, but does NOT redirect when signed out — returns null
// instead. Public pages (e.g. a hub profile) render differently for a signed-in
// player but must not bounce anonymous visitors to /login.
export const getViewer = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
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
    },
  });
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
      image: true,
      role: true,
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

// Partner-only guard. Lives here rather than in hubs.ts so billing.ts can use
// it without a cycle (hubs.ts imports billing.ts for the listing filter);
// hubs.ts re-exports it, so existing importers are unaffected.
//
// Redirects to /dashboard rather than /login: the visitor is signed in, they
// just aren't a partner.
export async function requirePartner() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARTNER") {
    redirect("/dashboard");
  }
  return user;
}
