import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PartnerHome } from "@/components/dashboard/home/PartnerHome";
import { getCurrentUser } from "@/lib/dal";
import { dashboardHomeFor } from "@/lib/dashboard";
import { getActivePartnerGateway } from "@/lib/partner-gateway";

export const metadata: Metadata = {
  title: "Partner Home — Bunal.ph",
};

export default async function PartnerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "PARTNER") redirect(dashboardHomeFor(user.role));

  const gateway =
    user.partnerStatus === "ACTIVE"
      ? await getActivePartnerGateway(user.id)
      : null;

  return (
    <PartnerHome
      user={user}
      partnerStatus={user.partnerStatus}
      isGatewayConnected={gateway != null}
    />
  );
}
