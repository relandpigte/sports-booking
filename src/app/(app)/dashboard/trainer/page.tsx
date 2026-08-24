import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TrainerProfileForm } from "@/components/trainers/TrainerProfileForm";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { TrainerWorkspaceHeader } from "@/components/trainers/TrainerWorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/dal";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Profile — Bunal.club" };

export default async function TrainerDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  const tone =
    profile?.status === "ACTIVE"
      ? "success"
      : profile?.status === "PENDING"
        ? "warn"
        : "neutral";
  const formProfile = profile
    ? {
        status: profile.status,
        bio: profile.bio,
        sports: profile.sports,
        specialties: profile.specialties,
        experience: profile.experience,
        certifications: profile.certifications,
        area: profile.area,
        locationDetails: profile.locationDetails,
        hourlyRate: profile.hourlyRate ? Number(profile.hourlyRate) : null,
        facebookPage: profile.facebookPage,
        user: {
          username: profile.user.username,
          phone: profile.user.phone,
          image: profile.user.image,
        },
      }
    : null;
  const callout =
    profile?.status === "ACTIVE"
      ? "Keep your public profile, availability, and payment setup current for new requests."
      : profile?.status === "PENDING"
        ? "Your application is with the admin team. You can still keep your setup details current."
        : "Complete your profile details, then set weekly availability and payments before submitting for review.";

  return (
    <div>
      <TrainerWorkspaceHeader
        title="Trainer command center"
        description="Set up and maintain the public profile, availability, rate, and payments players need to request coaching."
        badge={<Badge tone={tone}>{profile?.status ?? "NOT STARTED"}</Badge>}
        calloutLabel="Next action"
        callout={callout}
        icon="profile"
      />
      <div className="mt-6">
        <TrainerTabs />
      </div>
      <TrainerProfileForm profile={formProfile} />
    </div>
  );
}
