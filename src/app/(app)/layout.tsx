import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/dashboard/AppShell";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Authoritative auth check — redirects to /login when not signed in.
  const user = await getCurrentUser();
  if (!user) return null; // unreachable; narrows the type for AppShell

  return <AppShell user={user}>{children}</AppShell>;
}
