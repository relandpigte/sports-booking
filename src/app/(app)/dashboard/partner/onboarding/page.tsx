import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { PartnerApplicationForm } from "@/components/partner/PartnerApplicationForm";
import { requirePartner } from "@/lib/dal";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Partner Application — Bunal.club",
};

export default async function PartnerOnboardingPage() {
  const partner = await requirePartner();
  if (partner.partnerStatus !== "DRAFT") redirect("/dashboard/partner");

  const existingHub = await prisma.hub.findFirst({
    where: { ownerId: partner.id },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      slug: true,
      about: true,
      logo: true,
      coverPhotos: true,
      games: true,
      address: true,
      latitude: true,
      longitude: true,
      phone: true,
      email: true,
    },
  });

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Partner onboarding"
        title="Submit your venue for review"
        description="Complete the owner and first-hub details below when you are ready."
      />
      <PartnerApplicationForm user={partner} existingHub={existingHub} />
    </div>
  );
}
