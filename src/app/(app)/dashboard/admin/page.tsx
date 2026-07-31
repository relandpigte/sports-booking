import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { getCurrentUser } from "@/lib/dal";
import { pendingPartnerCount, userCounts } from "@/lib/admin";
import { dashboardHomeFor } from "@/lib/dashboard";
import { pendingServiceFeeSettlementCount } from "@/lib/service-fees";

export const metadata: Metadata = {
  title: "Admin Home — Bunal.club",
};

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") redirect(dashboardHomeFor(user.role));

  const [counts, pendingPartners, pendingSettlements] = await Promise.all([
    userCounts(),
    pendingPartnerCount(),
    pendingServiceFeeSettlementCount(),
  ]);
  return (
    <AdminHome
      name={user.name}
      counts={counts}
      pendingPartners={pendingPartners}
      pendingSettlements={pendingSettlements}
    />
  );
}
