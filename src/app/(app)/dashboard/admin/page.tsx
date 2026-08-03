import type { Metadata } from "next";

import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { requireAdmin } from "@/lib/admin";
import { pendingPartnerCount, userCounts } from "@/lib/admin";
import { pendingServiceFeeSettlementCount } from "@/lib/service-fees";

export const metadata: Metadata = {
  title: "Admin Home — Bunal.club",
};

export default async function AdminDashboardPage() {
  const user = await requireAdmin();

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
