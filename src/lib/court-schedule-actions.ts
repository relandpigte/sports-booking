"use server";

import * as z from "zod";
import { Prisma, type CourtBlockType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { WEEKDAYS, type OperatingHours, type Weekday } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { dayWindow, weekdayIndexForDate } from "@/lib/slots";
import {
  formatHourLabel,
  isValidDateString,
  manilaToday,
} from "@/lib/time";
import { recordImpersonatedAction } from "@/lib/impersonation";
import { recordPartnerActivity, requirePartnerWorkspace } from "@/lib/staffing";

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

export type CourtBlockFormState = {
  message?: string;
  success?: string;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const CourtBlockSchema = z
  .object({
    hubId: z.string().min(1),
    date: z.string().refine(isValidDateString, "Choose a valid date."),
    courtIds: z.array(z.string().min(1)).min(1, "Choose at least one court.").max(50),
    startHour: z.coerce.number().int().min(0).max(23),
    endHour: z.coerce.number().int().min(1).max(24),
    type: z.enum(["WALK_IN", "MAINTENANCE", "PRIVATE_USE", "OTHER"]),
    publicReason: optionalText(120),
    customerName: optionalText(120),
    customerPhone: optionalText(40),
    amountPaid: z.preprocess(
      (value) => (value === "" ? null : value),
      z.coerce.number().min(0).max(1_000_000).nullable()
    ),
    internalNote: optionalText(500),
  })
  .refine((value) => value.endHour > value.startHour, {
    message: "The end time must be later than the start time.",
    path: ["endHour"],
  });

function revalidateScheduleSurfaces(hub: { id: string; slug: string | null }) {
  revalidatePath("/dashboard/hubs");
  revalidatePath(`/dashboard/hubs/${hub.id}/schedule`);
  revalidatePath("/hubs");
  revalidatePath(`/hubs/${hub.id}`);
  if (hub.slug) revalidatePath(`/hubs/${hub.slug}`);
}

export async function updateCourtScheduleAction(
  _previous: CourtScheduleFormState,
  formData: FormData
): Promise<CourtScheduleFormState> {
  const workspace = await requirePartnerWorkspace("hubs", "MANAGE");
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
    where: { id: hubId, ownerId: workspace.partnerId },
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

  await recordImpersonatedAction({
    action: "COURT_SCHEDULE_UPDATED",
    targetType: "Hub",
    targetId: hub.id,
    metadata: { ruleCount: rules.length },
  });
  await recordPartnerActivity({
    workspace,
    action: "COURT_SCHEDULE_UPDATED",
    targetType: "Hub",
    targetId: hub.id,
    metadata: { ruleCount: rules.length },
  });

  revalidateScheduleSurfaces(hub);

  return { success: "Weekly court schedule saved." };
}

export async function createCourtBlockAction(
  _previous: CourtBlockFormState,
  formData: FormData
): Promise<CourtBlockFormState> {
  const workspace = await requirePartnerWorkspace("bookings", "MANAGE");
  const parsed = CourtBlockSchema.safeParse({
    hubId: String(formData.get("hubId") ?? ""),
    date: String(formData.get("date") ?? ""),
    courtIds: formData.getAll("courtIds").map(String),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    type: String(formData.get("type") ?? ""),
    publicReason: String(formData.get("publicReason") ?? ""),
    customerName: String(formData.get("customerName") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    amountPaid: formData.get("amountPaid") ?? "",
    internalNote: String(formData.get("internalNote") ?? ""),
  });
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Check the block details.",
    };
  }

  const values = parsed.data;
  if (values.date < manilaToday()) {
    return { message: "Past dates can no longer be blocked." };
  }

  const uniqueCourtIds = [...new Set(values.courtIds)];
  const hub = await prisma.hub.findFirst({
    where: { id: values.hubId, ownerId: workspace.partnerId },
    select: {
      id: true,
      slug: true,
      operatingHours: true,
      courts: {
        where: { id: { in: uniqueCourtIds } },
        select: {
          id: true,
          name: true,
          scheduleRules: {
            where: { weekday: weekdayIndexForDate(values.date), closed: true },
            select: { hour: true, closureReason: true },
          },
        },
      },
    },
  });
  if (!hub) return { message: "Hub not found." };
  if (hub.courts.length !== uniqueCourtIds.length) {
    return { message: "One of those courts does not belong to this hub." };
  }

  const operatingHours = hub.operatingHours as OperatingHours | null;
  const weekday = WEEKDAYS[weekdayIndexForDate(values.date)]?.value as
    | Weekday
    | undefined;
  const window = weekday && operatingHours
    ? dayWindow(operatingHours[weekday])
    : null;
  if (
    !window ||
    values.startHour < window.start ||
    values.endHour > window.end
  ) {
    return { message: "Choose hours within the hub's operating hours." };
  }

  const hours = Array.from(
    { length: values.endHour - values.startHour },
    (_, index) => values.startHour + index
  );
  const recurringConflict = hub.courts.find((court) =>
    court.scheduleRules.some((rule) => hours.includes(rule.hour))
  );
  if (recurringConflict) {
    return {
      message: `${recurringConflict.name} is already closed during part of that time in the weekly schedule.`,
    };
  }

  const now = new Date();
  let blockId: string;
  try {
    blockId = await prisma.$transaction(async (tx) => {
      // Expired payment holds no longer own their hours. Removing only the
      // exact candidate slots keeps lock ordering narrow and deterministic.
      await tx.bookingSlot.deleteMany({
        where: {
          courtId: { in: uniqueCourtIds },
          date: values.date,
          hour: { in: hours },
          holdExpiresAt: { lt: now },
        },
      });

      const block = await tx.courtBlock.create({
        data: {
          hubId: hub.id,
          type: values.type as CourtBlockType,
          date: values.date,
          startHour: values.startHour,
          endHour: values.endHour,
          publicReason: values.publicReason,
          customerName:
            values.type === "WALK_IN" ? values.customerName : null,
          customerPhone:
            values.type === "WALK_IN" ? values.customerPhone : null,
          amountPaid:
            values.type === "WALK_IN" && values.amountPaid != null
              ? new Prisma.Decimal(Math.round(values.amountPaid * 100) / 100)
              : null,
          internalNote: values.internalNote,
          createdById: workspace.actorId,
        },
        select: { id: true },
      });

      // Do not skip duplicates: the unique court/date/hour constraint must
      // abort the entire multi-court block when any one slot is occupied.
      await tx.bookingSlot.createMany({
        data: uniqueCourtIds.flatMap((courtId) =>
          hours.map((hour) => ({
            blockId: block.id,
            courtId,
            date: values.date,
            hour,
            holdExpiresAt: null,
          }))
        ),
      });
      return block.id;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        message:
          "One of those court hours is already booked, blocked, or assigned to an event. Refresh and choose another time.",
      };
    }
    throw error;
  }

  await recordImpersonatedAction({
    action: "COURT_BLOCK_CREATED",
    targetType: "CourtBlock",
    targetId: blockId,
    metadata: {
      hubId: hub.id,
      type: values.type,
      date: values.date,
      startHour: values.startHour,
      endHour: values.endHour,
      courtCount: uniqueCourtIds.length,
    },
  });
  await recordPartnerActivity({
    workspace,
    action: "COURT_BLOCK_CREATED",
    targetType: "CourtBlock",
    targetId: blockId,
    metadata: { hubId: hub.id, date: values.date },
  });
  revalidateScheduleSurfaces(hub);
  return { success: "Court time blocked successfully." };
}

export async function releaseCourtBlockAction(formData: FormData): Promise<void> {
  const workspace = await requirePartnerWorkspace("bookings", "MANAGE");
  const blockId = String(formData.get("blockId") ?? "");
  if (!blockId) return;

  const block = await prisma.courtBlock.findFirst({
    where: {
      id: blockId,
      releasedAt: null,
      hub: { ownerId: workspace.partnerId },
    },
    select: { id: true, hub: { select: { id: true, slug: true } } },
  });
  if (!block) return;

  const released = await prisma.$transaction(async (tx) => {
    const updated = await tx.courtBlock.updateMany({
      where: { id: block.id, releasedAt: null },
      data: { releasedAt: new Date(), releasedById: workspace.actorId },
    });
    if (updated.count !== 1) return false;
    await tx.bookingSlot.deleteMany({ where: { blockId: block.id } });
    return true;
  });
  if (!released) return;

  await recordImpersonatedAction({
    action: "COURT_BLOCK_RELEASED",
    targetType: "CourtBlock",
    targetId: block.id,
    metadata: { hubId: block.hub.id },
  });
  await recordPartnerActivity({
    workspace,
    action: "COURT_BLOCK_RELEASED",
    targetType: "CourtBlock",
    targetId: block.id,
    metadata: { hubId: block.hub.id },
  });
  revalidateScheduleSurfaces(block.hub);
}
