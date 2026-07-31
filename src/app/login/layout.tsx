import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/dal";

export default async function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await getViewer();
  if (viewer) redirect("/dashboard");

  return children;
}
