import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { getCurrentUser } from "@/lib/dal";
import { userCounts } from "@/lib/admin";
import { dashboardHomeFor } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Admin Home — Sports 360",
};

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") redirect(dashboardHomeFor(user.role));

  const counts = await userCounts();
  return <AdminHome name={user.name} counts={counts} />;
}
