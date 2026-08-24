import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TrainerScheduleForm } from "@/components/trainers/TrainerScheduleForm";
import { TrainerTabs } from "@/components/trainers/TrainerTabs";
import { TrainerWorkspaceHeader } from "@/components/trainers/TrainerWorkspaceHeader";
import { getCurrentUser } from "@/lib/dal";
import { getTrainerProfileForUser } from "@/lib/trainers";

export const metadata: Metadata = { title: "Trainer Schedule — Bunal.club" };

export default async function TrainerSchedulePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") redirect("/dashboard");
  const profile = await getTrainerProfileForUser(user.id);
  if (!profile) redirect("/dashboard/trainer");
  return (
    <div>
      <TrainerWorkspaceHeader
        title="Your availability"
        description="Set recurring hours and date-specific exceptions without affecting sessions that are already reserved."
        calloutLabel="Scheduling rule"
        callout="Players request whole, consecutive hours inside the availability windows you set."
        icon="schedule"
      />
      <div className="mt-6">
        <TrainerTabs />
      </div>
      <TrainerScheduleForm
        rules={profile.weeklyRules.map(
          ({ dayOfWeek, startHour, endHour }) => ({
            dayOfWeek,
            startHour,
            endHour,
          })
        )}
        exceptions={profile.exceptions.map(
          ({ id, date, startHour, endHour, type, note }) => ({
            id,
            date,
            startHour,
            endHour,
            type,
            note,
          })
        )}
      />
    </div>
  );
}
