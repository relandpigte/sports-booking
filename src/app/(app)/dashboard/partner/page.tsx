import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PartnerHome } from "@/components/dashboard/home/PartnerHome";
import { getCurrentUser } from "@/lib/dal";
import { dashboardHomeFor } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import {
  getPartnerPaymentSetup,
  isPartnerPaymentReady,
} from "@/lib/manual-payments";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";

export const metadata: Metadata = {
  title: "Partner Home — Bunal.club",
};

export default async function PartnerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "PARTNER") redirect(dashboardHomeFor(user.role));

  const impersonation = await getCurrentPartnerImpersonation();
  const canOperate =
    user.partnerStatus === "ACTIVE" || impersonation?.partner.id === user.id;
  const [paymentSetup, hubCount] = await Promise.all([
    canOperate ? getPartnerPaymentSetup(user.id) : Promise.resolve(null),
    prisma.hub.count({ where: { ownerId: user.id } }),
  ]);

  return (
    <PartnerHome
      user={user}
      partnerStatus={user.partnerStatus}
      isPaymentReady={
        paymentSetup ? isPartnerPaymentReady(paymentSetup) : false
      }
      hasHub={hubCount > 0}
      canOperate={canOperate}
    />
  );
}
