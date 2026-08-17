import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { StaffTeamManager } from "@/components/staff/StaffTeamManager";
import { getAuthenticatedUser } from "@/lib/dal";
import { listPartnerStaff } from "@/lib/staffing-actions";

export const metadata: Metadata = { title: "Team — Bunal.club" };

export default async function TeamPage() {
  const owner = await getAuthenticatedUser();
  if (
    !owner ||
    owner.role !== "PARTNER" ||
    owner.partnerStatus !== "ACTIVE"
  ) {
    redirect("/dashboard");
  }
  const [members, invitations, activity] = await listPartnerStaff(owner.id);
  return (
    <div>
      <DashboardPageHeader
        eyebrow="Partner team"
        title="Staff access"
        description="Invite staff and control what each person can view or manage across your venue account."
      />
      <StaffTeamManager
        members={members}
        invitations={invitations}
        activity={activity}
      />
    </div>
  );
}
