import "server-only";

import { Prisma } from "@prisma/client";

import {
  TRAINER_BOOKING_WINDOW_DAYS,
  bookingServiceFeeFor,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendTrainerLifecycleEmail } from "@/lib/email";
import { appUrl } from "@/lib/urls";
import { addDays, manilaToday, manilaWeekday } from "@/lib/time";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

const weekdayIndex = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
} as const;

export function trainerServiceFeeFor(amount: number): number {
  return bookingServiceFeeFor(amount);
}

export function trainerPaymentSecondsLeft(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

export function trainerPaymentReady(profile: {
  paymentMode: "AUTOMATIC" | "MANUAL";
  user: {
    trainerGateway: { disconnectedAt: Date | null } | null;
    trainerManualMethods: Array<{ id: string }>;
  };
}): boolean {
  return profile.paymentMode === "AUTOMATIC"
    ? profile.user.trainerGateway?.disconnectedAt == null &&
        profile.user.trainerGateway != null
    : profile.user.trainerManualMethods.length > 0;
}

type ScheduleProfile = {
  weeklyRules: Array<{ dayOfWeek: number; startHour: number; endHour: number }>;
  exceptions: Array<{
    date: string;
    startHour: number;
    endHour: number;
    type: "AVAILABLE" | "UNAVAILABLE";
  }>;
};

export function trainerAvailableHours(
  profile: ScheduleProfile,
  date: string,
  occupiedHours: number[] = []
): number[] {
  const day = weekdayIndex[manilaWeekday(date)];
  const hours = new Set<number>();
  for (const rule of profile.weeklyRules) {
    if (rule.dayOfWeek !== day) continue;
    for (let hour = rule.startHour; hour < rule.endHour; hour += 1) {
      hours.add(hour);
    }
  }
  for (const exception of profile.exceptions) {
    if (exception.date !== date) continue;
    for (let hour = exception.startHour; hour < exception.endHour; hour += 1) {
      if (exception.type === "AVAILABLE") hours.add(hour);
      else hours.delete(hour);
    }
  }
  for (const hour of occupiedHours) hours.delete(hour);
  return [...hours].sort((left, right) => left - right);
}

export function rangeAvailable(
  available: number[],
  startHour: number,
  endHour: number
): boolean {
  const set = new Set(available);
  for (let hour = startHour; hour < endHour; hour += 1) {
    if (!set.has(hour)) return false;
  }
  return true;
}

const publicTrainerSelect = {
  id: true,
  status: true,
  bio: true,
  sports: true,
  specialties: true,
  experience: true,
  certifications: true,
  area: true,
  hourlyRate: true,
  facebookPage: true,
  paymentMode: true,
  weeklyRules: {
    orderBy: [{ dayOfWeek: "asc" as const }, { startHour: "asc" as const }],
    select: { dayOfWeek: true, startHour: true, endHour: true },
  },
  exceptions: {
    where: { date: { gte: manilaToday() } },
    orderBy: [{ date: "asc" as const }, { startHour: "asc" as const }],
    select: { date: true, startHour: true, endHour: true, type: true },
  },
  user: {
    select: {
      id: true,
      username: true,
      name: true,
      playerName: true,
      image: true,
      privateProfile: true,
      trainerGateway: { select: { disconnectedAt: true } },
      trainerManualMethods: {
        where: { active: true },
        take: 1,
        select: { id: true },
      },
    },
  },
} satisfies Prisma.TrainerProfileSelect;

export type PublicTrainer = Prisma.TrainerProfileGetPayload<{
  select: typeof publicTrainerSelect;
}>;

function isPublicTrainer(profile: PublicTrainer): boolean {
  return (
    profile.status === "ACTIVE" &&
    !profile.user.privateProfile &&
    Boolean(profile.user.username) &&
    profile.hourlyRate != null &&
    trainerPaymentReady({ paymentMode: profile.paymentMode, user: profile.user })
  );
}

export async function listPublicTrainers(filters: {
  query?: string;
  sport?: string;
  area?: string;
  date?: string;
  maxRate?: number;
} = {}): Promise<PublicTrainer[]> {
  const rows = await prisma.trainerProfile.findMany({
    where: {
      status: "ACTIVE",
      user: {
        privateProfile: false,
        username: { not: null },
      },
      ...(filters.sport ? { sports: { has: filters.sport } } : {}),
      ...(filters.area
        ? { area: { contains: filters.area, mode: "insensitive" } }
        : {}),
      ...(filters.maxRate != null
        ? { hourlyRate: { lte: new Prisma.Decimal(filters.maxRate) } }
        : {}),
    },
    orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
    select: publicTrainerSelect,
  });
  const query = filters.query?.trim().toLocaleLowerCase("en-PH");
  const date = filters.date;
  const withReadiness = rows.filter(isPublicTrainer);
  const withQuery = query
    ? withReadiness.filter((profile) =>
        [
          profile.user.playerName,
          profile.user.name,
          profile.area,
          ...profile.sports,
          ...profile.specialties,
        ].some((value) => value?.toLocaleLowerCase("en-PH").includes(query))
      )
    : withReadiness;
  if (!date) return withQuery;

  const occupied = await prisma.trainerSessionSlot.findMany({
    where: {
      date,
      trainerProfileId: { in: withQuery.map((row) => row.id) },
      session: {
        OR: [
          { status: "REQUESTED", requestExpiresAt: { gt: new Date() } },
          { status: "AWAITING_PAYMENT", paymentExpiresAt: { gt: new Date() } },
          { status: "PAYMENT_REVIEW" },
          { status: "CONFIRMED" },
        ],
      },
    },
    select: { trainerProfileId: true, hour: true },
  });
  return withQuery.filter((profile) =>
    trainerAvailableHours(
      profile,
      date,
      occupied
        .filter((slot) => slot.trainerProfileId === profile.id)
        .map((slot) => slot.hour)
    ).length > 0
  );
}

export async function getPublicTrainer(username: string) {
  const profile = await prisma.trainerProfile.findFirst({
    where: { user: { username } },
    select: publicTrainerSelect,
  });
  return profile && isPublicTrainer(profile) ? profile : null;
}

export async function getPublicPlayer(username: string) {
  return prisma.user.findFirst({
    where: { username, privateProfile: false },
    select: {
      id: true,
      username: true,
      name: true,
      playerName: true,
      image: true,
      skillLevel: true,
      trainerProfile: { select: { id: true, status: true } },
    },
  });
}

export async function getTrainerProfileForUser(userId: string) {
  return prisma.trainerProfile.findUnique({
    where: { userId },
    include: {
      weeklyRules: { orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }] },
      exceptions: { orderBy: [{ date: "asc" }, { startHour: "asc" }] },
      user: {
        select: {
          id: true,
          role: true,
          username: true,
          name: true,
          playerName: true,
          email: true,
          phone: true,
          image: true,
          privateProfile: true,
          trainerGateway: { select: { id: true, disconnectedAt: true, accountLabel: true } },
          trainerManualMethods: {
            orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
  });
}

export async function getTrainerAvailability(profileId: string, date: string) {
  if (date < manilaToday() || date > addDays(manilaToday(), TRAINER_BOOKING_WINDOW_DAYS)) {
    return [];
  }
  const profile = await prisma.trainerProfile.findUnique({
    where: { id: profileId },
    select: {
      weeklyRules: { select: { dayOfWeek: true, startHour: true, endHour: true } },
      exceptions: {
        where: { date },
        select: { date: true, startHour: true, endHour: true, type: true },
      },
      slots: {
        where: {
          date,
          session: {
            OR: [
              { status: "REQUESTED", requestExpiresAt: { gt: new Date() } },
              { status: "AWAITING_PAYMENT", paymentExpiresAt: { gt: new Date() } },
              { status: "PAYMENT_REVIEW" },
              { status: "CONFIRMED" },
            ],
          },
        },
        select: { hour: true },
      },
    },
  });
  return profile
    ? trainerAvailableHours(profile, date, profile.slots.map((slot) => slot.hour))
    : [];
}

export async function sweepTrainerSessions(now = new Date()) {
  const expiring = await prisma.trainerSession.findMany({
    where: {
      OR: [
        { status: "REQUESTED", requestExpiresAt: { lte: now } },
        { status: "AWAITING_PAYMENT", paymentExpiresAt: { lte: now } },
      ],
    },
    include: {
      player: { select: { email: true, name: true, playerName: true } },
      trainer: { include: { user: { select: { email: true, name: true, playerName: true } } } },
    },
  });
  let expired = 0;
  for (const row of expiring) {
    const changed = await prisma.$transaction(async (tx) => {
      const changed = await tx.trainerSession.updateMany({
        where: {
          id: row.id,
          status: row.status,
          ...(row.status === "REQUESTED"
            ? { requestExpiresAt: { lte: now } }
            : { paymentExpiresAt: { lte: now } }),
        },
        data: { status: "EXPIRED" },
      });
      if (changed.count !== 1) return false;
      await tx.trainerSessionSlot.deleteMany({ where: { trainerSessionId: row.id } });
      await tx.trainerPayment.updateMany({
        where: { trainerSessionId: row.id, status: "PENDING" },
        data: {
          status: "FAILED",
          failureCode: "expired",
          failureMessage: "The trainer-session payment window expired.",
        },
      });
      expired += 1;
      return true;
    });
    if (changed) {
      const reason = row.status === "REQUESTED" ? "The trainer did not respond within 12 hours." : "The one-hour payment window ended.";
      await Promise.all([
        sendTrainerNotice({
          to: row.player.email,
          recipientName: row.player.playerName ?? row.player.name ?? "Player",
          subject: "Trainer session request expired",
          heading: "The trainer session was released",
          message: reason,
          actionUrl: appUrl("/trainers"),
          actionLabel: "Find a trainer",
          idempotencyKey: `trainer-expired-${row.id}-player`,
        }),
        sendTrainerNotice({
          to: row.trainer.user.email,
          recipientName: row.trainer.user.playerName ?? row.trainer.user.name ?? "Trainer",
          subject: "Trainer session request expired",
          heading: "The reserved hours were released",
          message: reason,
          actionUrl: appUrl("/dashboard/trainer/sessions"),
          actionLabel: "View sessions",
          idempotencyKey: `trainer-expired-${row.id}-trainer`,
        }),
      ]);
    }
  }
  const completed = await prisma.trainerSession.updateMany({
    where: { status: "CONFIRMED", endsAt: { lte: now } },
    data: { status: "COMPLETED", completedAt: now },
  });
  return { expired, completed: completed.count };
}

async function sendTrainerNotice(input: Parameters<typeof sendTrainerLifecycleEmail>[0]) {
  if (!emailDeliveryConfigured() || input.to.endsWith("@example.com")) return;
  try {
    await sendTrainerLifecycleEmail(input);
  } catch (error) {
    console.error("Trainer reminder email failed:", error instanceof Error ? error.message : "Unknown error");
  }
}

export async function sendTrainerSessionReminders(now = new Date()) {
  const from = new Date(now.getTime() + 23 * 3_600_000);
  const to = new Date(now.getTime() + 25 * 3_600_000);
  const sessions = await prisma.trainerSession.findMany({
    where: { status: "CONFIRMED", reminderSentAt: null, startsAt: { gt: from, lte: to } },
    include: {
      player: { select: { email: true, name: true, playerName: true } },
      trainer: { include: { user: { select: { email: true, name: true, playerName: true } } } },
    },
  });
  let sent = 0;
  for (const session of sessions) {
    const claimed = await prisma.trainerSession.updateMany({
      where: { id: session.id, status: "CONFIRMED", reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;
    const schedule = `${formatManilaDateLong(session.date)}, ${formatSlotRange(session.startHour, session.endHour)}`;
    await Promise.all([
      sendTrainerNotice({ to: session.player.email, recipientName: session.player.playerName ?? session.player.name ?? "Player", subject: "Trainer session tomorrow", heading: "Your training session is coming up", message: schedule, actionUrl: appUrl("/dashboard/bookings?type=trainers"), actionLabel: "View session", idempotencyKey: `trainer-reminder-${session.id}-player` }),
      sendTrainerNotice({ to: session.trainer.user.email, recipientName: session.trainer.user.playerName ?? session.trainer.user.name ?? "Trainer", subject: "Trainer session tomorrow", heading: "Your training session is coming up", message: schedule, actionUrl: appUrl("/dashboard/trainer/sessions"), actionLabel: "View session", idempotencyKey: `trainer-reminder-${session.id}-trainer` }),
    ]);
    sent += 1;
  }
  return { sent };
}
