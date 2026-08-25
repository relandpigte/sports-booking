import type { ReactNode } from "react";

import { PublicTopBar } from "@/components/hubs/PublicTopBar";
import { AppShell } from "@/components/dashboard/AppShell";
import { ReservationHoldDock } from "@/components/bookings/ReservationHoldDock";
import { getAuthenticatedUser, getViewer } from "@/lib/dal";
import { getActivePartnerImpersonation } from "@/lib/impersonation";
import {
  getActiveBookingHoldForGuest,
  getActiveBookingHoldForUser,
} from "@/lib/booking-payments";
import { getCurrentGuestReservationId } from "@/lib/guest-bookings";
import { hasMessageAccess } from "@/lib/messages";
import { getPartnerWorkspace } from "@/lib/staffing";

// Chrome for pages that are public but that signed-in people also use.
//
// Signed in, you get the normal app shell — navigation, account controls, and
// a way back to the dashboard — so browsing a hub is never a dead end. Signed
// out, the plain
// public top bar. getViewer is per-request memoized and returns null rather
// than redirecting, which is what makes this safe on a public route. Pages
// marked alwaysPublic keep the public chrome but swap auth actions for a direct
// Dashboard link when a viewer is already signed in.
export async function PageShell({
  children,
  maxWidth = "max-w-5xl",
  backgroundClass = "bg-white",
  padded = true,
  alwaysPublic = false,
}: {
  children: ReactNode;
  maxWidth?: string;
  backgroundClass?: string;
  padded?: boolean;
  alwaysPublic?: boolean;
}) {
  const [viewer, actor] = await Promise.all([
    getViewer(),
    getAuthenticatedUser(),
  ]);
  const guestReservationId = viewer
    ? null
    : await getCurrentGuestReservationId();
  const [impersonation, activeBookingHold, workspace] = await Promise.all([
    actor?.role === "ADMIN"
      ? getActivePartnerImpersonation(actor.id)
      : Promise.resolve(null),
    viewer?.role === "PLAYER"
      ? getActiveBookingHoldForUser({ userId: viewer.id })
      : guestReservationId
        ? getActiveBookingHoldForGuest({ guestReservationId })
        : Promise.resolve(null),
    viewer ? getPartnerWorkspace() : Promise.resolve(null),
  ]);
  const hasMessages = !viewer || impersonation
    ? false
    : workspace?.kind === "STAFF"
      ? workspace.permissions.messages !== "NONE"
      : await hasMessageAccess({
          userId: viewer.id,
          role: viewer.role,
          partnerStatus: viewer.partnerStatus,
        });

  // Assisted access always keeps the authenticated shell visible so the
  // actor/target banner and exit control cannot disappear on a public page.
  if (viewer && (!alwaysPublic || impersonation)) {
    return (
      <AppShell
        user={viewer}
        maxWidth={maxWidth}
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
        activeBookingHold={activeBookingHold}
      >
        {children}
      </AppShell>
    );
  }

  return (
    <div className={`min-h-screen ${backgroundClass}`}>
      <PublicTopBar signedIn={Boolean(viewer)} />
      <main
        className={`mx-auto w-full ${maxWidth} ${padded ? "px-4 pb-16 sm:px-6" : ""}`}
      >
        {children}
      </main>
      {activeBookingHold && (
        <ReservationHoldDock
          hold={activeBookingHold}
          hideOnOwnHub={Boolean(viewer)}
          isGuest={!viewer}
          reservePageSpace={!viewer}
        />
      )}
    </div>
  );
}
