import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { PartnerApplicationForm } from "@/components/partner/PartnerApplicationForm";
import { requirePartner } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Partner Application — Bunal.club",
};

export default async function PartnerOnboardingPage() {
  const partner = await requirePartner();
  if (partner.partnerStatus !== "DRAFT") redirect("/dashboard/partner");

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Partner onboarding"
        title="Submit your venue for review"
        description="Complete the owner and first-hub details below when you are ready."
      />
      <PartnerApplicationForm user={partner} />
    </div>
  );
}
