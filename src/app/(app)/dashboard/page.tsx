import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/dal";
import { dashboardHomeFor } from "@/lib/dashboard";
import { getPartnerWorkspace } from "@/lib/staffing";

// The dashboard entry point. Each role has its own page; this just sends
// people to theirs, so every existing link and redirect to /dashboard keeps
// working and post-login lands in the right place.
export default async function DashboardIndex() {
  const user = await getCurrentUser();
  // getCurrentUser already redirected if signed out; this narrows the type.
  if (!user) return null;
  const workspace = await getPartnerWorkspace();
  if (workspace?.kind === "STAFF") redirect("/dashboard/partner");
  redirect(dashboardHomeFor(user.role));
}
