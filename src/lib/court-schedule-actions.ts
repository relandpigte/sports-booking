"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";

import { WEEKDAYS, type OperatingHours, type Weekday } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { requireActivePartner } from "@/lib/dal";
import { dayWindow, weekdayIndexForDate } from "@/lib/slots";
import { formatHourLabel } from "@/lib/time";

const ScheduleRuleSchema = z.object({
  courtId: z.string().min(1),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  closed: z.boolean(),
  closureReason: z.string().trim().max(120).nullable().optional(),
  hourlyRate: z.number().min(0).max(1_000_000).nullable(),
});

const SchedulePayloadSchema = z
  .array(ScheduleRuleSchema)
  .max(2_000, { error: "That schedule contains too many rules." });

export type CourtScheduleFormState = {
  message?: string;
  success?: string;
};

export async function updateCourtScheduleAction(
  _previous: CourtScheduleFormState,
  formData: FormData
): Promise<CourtScheduleFormState> {
  const partner = await requireActivePartner();
  const hubId = String(formData.get("hubId") ?? "");
  const rawRules = String(formData.get("rules") ?? "[]");

  let json: unknown;
  try {
    json = JSON.parse(rawRules);
  } catch {
    return { message: "The schedule could not be read. Refresh and try again." };
  }

  const parsed = SchedulePayloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Check the schedule values.",
    };
  }

  const hub = await prisma.hub.findFirst({
    where: { id: hubId, ownerId: partner.id },
    select: {
      id: true,
      slug: true,
      operatingHours: true,
      courts: { select: { id: true, name: true } },
    },
  });
  if (!hub) return { message: "Hub not found." };

  const courtById = new Map(hub.courts.map((court) => [court.id, court]));
  const uniqueRules = new Map<string, z.infer<typeof ScheduleRuleSchema>>();
  const hours = (hub.operatingHours as OperatingHours | null) ?? null;

  for (const rule of parsed.data) {
    if (!courtById.has(rule.courtId)) {
      return { message: "One of those courts does not belong to this hub." };
    }

    const weekday = WEEKDAYS[rule.weekday]?.value as Weekday | undefined;
    const window = weekday && hours ? dayWindow(hours[weekday]) : null;
    if (!window || rule.hour < window.start || rule.hour >= window.end) {
      return {
        message: "A schedule rule falls outside the hub's operating hours.",
      };
    }

    // Only meaningful differences are persisted. Rates are normalized to
    // centavos before Prisma receives them.
    const normalized = {
      ...rule,
      closureReason: rule.closed ? rule.closureReason || null : null,
      hourlyRate:
        rule.hourlyRate == null
          ? null
          : Math.round(rule.hourlyRate * 100) / 100,
    };
    if (normalized.closed || normalized.hourlyRate != null) {
      uniqueRules.set(
        `${rule.courtId}:${rule.weekday}:${rule.hour}`,
        normalized
      );
    }
  }

  const rules = [...uniqueRules.values()];
  const closedKeys = new Set(
    rules
      .filter((rule) => rule.closed)
      .map((rule) => `${rule.courtId}:${rule.weekday}:${rule.hour}`)
  );

  if (closedKeys.size > 0) {
    const now = new Date();
    const booked = await prisma.bookingSlot.findMany({
      where: {
        courtId: { in: hub.courts.map((court) => court.id) },
        OR: [
          { booking: { status: "CONFIRMED", endsAt: { gte: now } } },
          {
            booking: {
              status: "PENDING",
              holdExpiresAt: { gt: now },
            },
          },
          {
            event: {
              status: "PUBLISHED",
              endsAt: { gte: now },
            },
          },
        ],
      },
      select: { courtId: true, date: true, hour: true },
    });
    const conflict = booked.find((slot) =>
      closedKeys.has(
        `${slot.courtId}:${weekdayIndexForDate(slot.date)}:${slot.hour}`
      )
    );
    if (conflict) {
      const court = courtById.get(conflict.courtId);
      return {
        message: `${court?.name ?? "That court"} has an upcoming booking on ${conflict.date} at ${formatHourLabel(conflict.hour)}. Move or cancel it before closing this weekly hour.`,
      };
    }
  }

  const courtIds = hub.courts.map((court) => court.id);
  await prisma.$transaction(async (tx) => {
    await tx.courtSlotRule.deleteMany({
      where: { courtId: { in: courtIds } },
    });
    if (rules.length > 0) {
      await tx.courtSlotRule.createMany({ data: rules });
    }
  });

  revalidatePath("/dashboard/hubs");
  revalidatePath(`/dashboard/hubs/${hub.id}/schedule`);
  revalidatePath("/hubs");
  revalidatePath(`/hubs/${hub.id}`);
  if (hub.slug) revalidatePath(`/hubs/${hub.slug}`);

  return { success: "Weekly court schedule saved." };
}
