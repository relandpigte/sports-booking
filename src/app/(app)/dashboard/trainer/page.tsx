import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { TrainerProfileForm } from "@/components/trainers/TrainerProfileForm";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/dal";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Profile — Bunal.club" };

export default async function TrainerDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  const tone = profile?.status === "ACTIVE" ? "success" : profile?.status === "PENDING" ? "warn" : "neutral";
  const formProfile = profile ? {
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
    user: { username: profile.user.username, phone: profile.user.phone, image: profile.user.image },
  } : null;
  return <div className="space-y-6"><DashboardPageHeader eyebrow="Trainer tools" title="Become a trainer" description="Set up your public coaching profile, availability, rate, and payments." badge={<Badge tone={tone}>{profile?.status ?? "NOT STARTED"}</Badge>} /><TrainerTabs /><TrainerProfileForm profile={formProfile} /></div>;
}
