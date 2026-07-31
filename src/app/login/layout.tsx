import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/dal";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await getViewer();
  if (viewer) redirect("/dashboard");

  return children;
}
