import type { ReactNode } from "react";

import { PublicTopBar } from "@/components/hubs/PublicTopBar";
import { AppShell } from "@/components/dashboard/AppShell";
import { getViewer } from "@/lib/dal";

// Chrome for pages that are public but that signed-in people also use.
//
// Signed in, you get the normal app shell — sidebar, nav, a way back to the
// dashboard — so browsing a hub is never a dead end. Signed out, the plain
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
  const viewer = await getViewer();

  if (viewer && !alwaysPublic) {
    return (
      <AppShell user={viewer} maxWidth={maxWidth}>
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
    </div>
  );
}
