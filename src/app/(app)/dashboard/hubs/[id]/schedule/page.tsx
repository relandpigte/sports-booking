import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CourtScheduleEditor } from "@/components/dashboard/hubs/CourtScheduleEditor";
import { getMyHubSchedule } from "@/lib/hubs";
import { manilaToday } from "@/lib/time";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "Court Schedule — Bunal.club",
};

export default async function CourtSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await requirePartnerWorkspace("hubs");
  const data = await getMyHubSchedule(id, workspace.partnerId);
  if (!data) notFound();

  return (
    <CourtScheduleEditor
      hubId={data.hub.id}
      hubName={data.hub.name}
      courts={data.hub.courts}
      operatingHours={data.hub.operatingHours}
      lockedSlots={data.lockedSlots}
      upcomingBlocks={data.upcomingBlocks}
      today={manilaToday()}
      canManageSchedule={hasStaffAccess(workspace, "hubs", "MANAGE")}
      canManageBlocks={hasStaffAccess(workspace, "bookings", "MANAGE")}
    />
  );
}
