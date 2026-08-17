import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/dashboard/AppShell";
import { getAuthenticatedUser, getCurrentUser } from "@/lib/dal";
import { getActivePartnerImpersonation } from "@/lib/impersonation";
import { hasMessageAccess } from "@/lib/messages";
import { getPartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Authoritative auth check — redirects to /login when not signed in.
  const [user, actor] = await Promise.all([
    getCurrentUser(),
    getAuthenticatedUser(),
  ]);
  if (!user) return null; // unreachable; narrows the type for AppShell

  const impersonation =
    actor?.role === "ADMIN"
      ? await getActivePartnerImpersonation(actor.id)
      : null;
  const [workspace, availableStaffWorkspace] = await Promise.all([
    getPartnerWorkspace(),
    user.role === "PLAYER"
      ? getPartnerWorkspace({ selectedStaffOnly: false })
      : Promise.resolve(null),
  ]);
  const hasMessages = impersonation
    ? false
    : workspace?.kind === "STAFF"
      ? workspace.permissions.messages !== "NONE"
      : await hasMessageAccess({
          userId: user.id,
          role: user.role,
          partnerStatus: user.partnerStatus,
        });

  return (
    <AppShell
      user={user}
      impersonation={
        impersonation
          ? {
              partnerName:
                impersonation.partner.name ?? impersonation.partner.email,
              adminName: impersonation.admin.name ?? impersonation.admin.email,
              expiresAt: impersonation.expiresAt,
            }
          : null
      }
      hasMessages={hasMessages}
      workspace={workspace}
      staffWorkspaceAvailable={Boolean(availableStaffWorkspace)}
    >
      {children}
    </AppShell>
  );
}
