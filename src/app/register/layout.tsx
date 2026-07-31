import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/dal";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Covers both /register and /register/partner. Cookie presence alone is not
// enough to redirect because stale Auth.js cookies can outlive their session.
export default async function RegisterLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await getViewer();
  if (viewer) redirect("/dashboard");

  return children;
}
