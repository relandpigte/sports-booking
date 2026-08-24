import { Prisma } from "@prisma/client";

import { addDays, manilaToday } from "@/lib/time";

type DatabaseClient = Prisma.TransactionClient;

// Record the schedule that becomes authoritative on a Manila civil date.
// Multiple saves on the same day replace that day's snapshot; earlier days
// remain immutable and the previous revision is closed the day before.
export async function recordCourtScheduleRevisions(
  db: DatabaseClient,
  courtIds: string[],
  effectiveFrom = manilaToday()
) {
  if (courtIds.length === 0) return;

  const courts = await db.court.findMany({
    where: { id: { in: courtIds } },
    select: {
      id: true,
      hub: { select: { operatingHours: true } },
      scheduleRules: {
        orderBy: [{ weekday: "asc" }, { hour: "asc" }],
        select: {
          weekday: true,
          hour: true,
          closed: true,
          hourlyRate: true,
        },
      },
    },
  });

  for (const court of courts) {
    await db.courtScheduleRevision.updateMany({
      where: {
        courtId: court.id,
        effectiveFrom: { lt: effectiveFrom },
        effectiveTo: null,
      },
      data: { effectiveTo: addDays(effectiveFrom, -1) },
    });

    const slotRules = court.scheduleRules.map((rule) => ({
      weekday: rule.weekday,
      hour: rule.hour,
      closed: rule.closed,
      hourlyRate: rule.hourlyRate == null ? null : Number(rule.hourlyRate),
    }));

    await db.courtScheduleRevision.upsert({
      where: {
        courtId_effectiveFrom: { courtId: court.id, effectiveFrom },
      },
      create: {
        courtId: court.id,
        effectiveFrom,
        operatingHours:
          court.hub.operatingHours === null
            ? Prisma.JsonNull
            : (court.hub.operatingHours as Prisma.InputJsonValue),
        slotRules: slotRules as Prisma.InputJsonValue,
      },
      update: {
        effectiveTo: null,
        operatingHours:
          court.hub.operatingHours === null
            ? Prisma.JsonNull
            : (court.hub.operatingHours as Prisma.InputJsonValue),
        slotRules: slotRules as Prisma.InputJsonValue,
      },
    });
  }
}
