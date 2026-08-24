"use server";

import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import {
  TRAINER_BOOKING_WINDOW_DAYS,
  TRAINER_MIN_LEAD_HOURS,
  TRAINER_PAYMENT_HOLD_MINUTES,
  TRAINER_REQUEST_HOLD_HOURS,
  paymongoQrPhProcessingFeeFor,
} from "@/lib/constants";
import { getViewer } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendTrainerLifecycleEmail } from "@/lib/email";
import { appUrl } from "@/lib/urls";
import {
  TrainerAdminDecisionSchema,
  TrainerCancelSchema,
  TrainerDecisionSchema,
  TrainerExceptionSchema,
  TrainerProfileSchema,
  TrainerRequestSchema,
  TrainerRescheduleSchema,
  TrainerWeeklyRuleSchema,
} from "@/lib/trainer-validation";
import {
  getTrainerAvailability,
  rangeAvailable,
  trainerPaymentReady,
  trainerServiceFeeFor,
} from "@/lib/trainers";
import { isTrainerServiceFeeOverdue } from "@/lib/trainer-service-fees";
import { addDays, manilaInstant, manilaToday } from "@/lib/time";
import { firstErrors } from "@/lib/zod-errors";

export type TrainerActionState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  sessionId?: string;
  paymentId?: string;
  missingRequirements?: Array<{
    label: string;
    actionLabel: string;
    href: string;
  }>;
};

function revalidateTrainerPaths(username?: string | null) {
  revalidatePath("/trainers");
  revalidatePath("/dashboard/trainer");
  revalidatePath("/dashboard/trainer/schedule");
  revalidatePath("/dashboard/trainer/sessions");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/users");
  if (username) revalidatePath(`/players/${username}`);
}

async function notify(input: Parameters<typeof sendTrainerLifecycleEmail>[0]) {
  if (!emailDeliveryConfigured() || input.to.endsWith("@example.com")) return;
  try {
    await sendTrainerLifecycleEmail(input);
  } catch (error) {
    console.error(
      "Trainer email delivery failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

function displayName(user: { name: string | null; playerName: string | null }) {
  return user.playerName ?? user.name ?? "Bunal.club member";
}

async function playerTrainer(viewerId: string) {
  return prisma.trainerProfile.findUnique({
    where: { userId: viewerId },
    include: {
      weeklyRules: true,
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
          trainerGateway: { select: { disconnectedAt: true } },
          trainerManualMethods: {
            where: { active: true },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
}

export async function saveTrainerProfileAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Only player accounts can create a trainer profile." };
  }
  const parsed = TrainerProfileSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    sports: formData.getAll("sports").map(String),
    specialties: String(formData.get("specialties") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    experience: String(formData.get("experience") ?? ""),
    certifications: String(formData.get("certifications") ?? ""),
    area: String(formData.get("area") ?? ""),
    locationDetails: String(formData.get("locationDetails") ?? ""),
    hourlyRate: String(formData.get("hourlyRate") ?? ""),
    facebookPage: String(formData.get("facebookPage") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const { username, ...profileData } = parsed.data;

  const duplicate = await prisma.user.findFirst({
    where: { username, id: { not: viewer.id } },
    select: { id: true },
  });
  if (duplicate) return { errors: { username: "That username is already taken" } };

  const existing = await prisma.trainerProfile.findUnique({
    where: { userId: viewer.id },
    select: { facebookPage: true, status: true },
  });
  const facebookChanged =
    existing?.status === "ACTIVE" &&
    existing.facebookPage !== parsed.data.facebookPage;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: viewer.id },
      data: { username },
    }),
    prisma.trainerProfile.upsert({
      where: { userId: viewer.id },
      create: {
        userId: viewer.id,
        ...profileData,
      },
      update: {
        ...profileData,
        ...(facebookChanged
          ? {
              status: "PENDING" as const,
              submittedAt: new Date(),
              facebookReviewedAt: null,
              facebookReviewedById: null,
            }
          : {}),
      },
    }),
  ]);
  revalidateTrainerPaths(username);
  return {
    success: facebookChanged
      ? "Profile saved. Your new Facebook Page is pending admin review, so new requests are paused."
      : "Trainer profile saved.",
  };
}

export async function saveTrainerScheduleAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Player account required." };
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: viewer.id },
    select: { id: true, user: { select: { username: true } } },
  });
  if (!profile) return { message: "Save your trainer profile first." };

  const rules = formData.getAll("dayOfWeek").map((value) => {
    const day = Number(value);
    return TrainerWeeklyRuleSchema.safeParse({
      dayOfWeek: day,
      startHour: formData.get(`startHour-${day}`),
      endHour: formData.get(`endHour-${day}`),
    });
  });
  const failed = rules.find((result) => !result.success);
  if (failed && !failed.success) return { errors: firstErrors(failed.error) };
  const data = rules.flatMap((result) => (result.success ? [result.data] : []));
  if (data.length === 0) return { errors: { schedule: "Choose at least one available day" } };

  await prisma.$transaction(async (tx) => {
    await tx.trainerAvailabilityRule.deleteMany({ where: { trainerProfileId: profile.id } });
    await tx.trainerAvailabilityRule.createMany({
      data: data.map((rule) => ({ trainerProfileId: profile.id, ...rule })),
    });
  });
  revalidateTrainerPaths(profile.user.username);
  return { success: "Weekly availability saved." };
}

export async function addTrainerExceptionAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Player account required." };
  const parsed = TrainerExceptionSchema.safeParse({
    date: String(formData.get("date") ?? ""),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    type: String(formData.get("type") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  if (parsed.data.date < manilaToday()) return { errors: { date: "Choose today or a future date" } };
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: viewer.id },
    select: { id: true, user: { select: { username: true } } },
  });
  if (!profile) return { message: "Save your trainer profile first." };
  try {
    await prisma.trainerAvailabilityException.create({
      data: { trainerProfileId: profile.id, ...parsed.data },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { message: "That date exception is already saved." };
    }
    throw error;
  }
  revalidateTrainerPaths(profile.user.username);
  return { success: "Schedule exception added." };
}

export async function deleteTrainerExceptionAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return;
  const id = String(formData.get("exceptionId") ?? "").slice(0, 60);
  if (!id) return;
  const removed = await prisma.trainerAvailabilityException.deleteMany({
    where: { id, trainer: { userId: viewer.id } },
  });
  if (removed.count === 1) revalidateTrainerPaths();
}

export async function submitTrainerApplicationAction(
  _previous: TrainerActionState,
  _formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Player account required." };
  const profile = await playerTrainer(viewer.id);
  if (!profile) return { message: "Complete your trainer profile first." };
  const missingProfileFields = [
    !profile.user.username ? "public username" : null,
    !profile.hourlyRate ? "hourly rate" : null,
    !profile.area ? "public area" : null,
    !profile.facebookPage ? "Facebook Page" : null,
    !profile.bio ? "bio" : null,
    !profile.experience ? "training experience" : null,
    profile.specialties.length === 0 ? "specialties" : null,
    profile.sports.length === 0 ? "sports" : null,
    !profile.locationDetails ? "private meeting instructions" : null,
  ].filter((field): field is string => field != null);
  const missingAccountItems = [
    !profile.user.image ? "profile photo" : null,
    !profile.user.phone ? "phone number" : null,
  ].filter((item): item is string => item != null);
  const missingRequirements = [
    ...(missingProfileFields.length > 0
      ? [
          {
            label: `Complete these trainer fields: ${missingProfileFields.join(", ")}.`,
            actionLabel: "Review trainer profile",
            href: "#trainer-profile",
          },
        ]
      : []),
    ...(missingAccountItems.length > 0
      ? [
          {
            label: `Add your ${missingAccountItems.join(" and ")} in Account Settings.`,
            actionLabel: "Open Account Settings",
            href: "/dashboard/account",
          },
        ]
      : []),
    ...(profile.weeklyRules.length === 0
      ? [
          {
            label: "Add at least one day to your weekly availability.",
            actionLabel: "Set availability",
            href: "/dashboard/trainer/schedule",
          },
        ]
      : []),
    ...(!trainerPaymentReady(profile)
      ? [
          {
            label:
              profile.paymentMode === "AUTOMATIC"
                ? "Connect your Trainer PayMongo account."
                : "Add an active manual payment destination.",
            actionLabel: "Set up payments",
            href: "/dashboard/trainer/payments",
          },
        ]
      : []),
  ];
  if (missingRequirements.length > 0) {
    return {
      message: "Your application is not ready yet. Complete the items below, then submit again.",
      missingRequirements,
    };
  }
  if (profile.status === "ACTIVE") return { message: "Your trainer profile is already active." };
  const submittedAt = new Date();
  await prisma.trainerProfile.update({
    where: { id: profile.id },
    data: { status: "PENDING", submittedAt, deactivatedAt: null, deactivationReason: null },
  });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true, name: true, playerName: true } });
  await Promise.all(admins.map((admin) => notify({
    to: admin.email,
    recipientName: displayName(admin),
    subject: "Trainer application awaiting review",
    heading: `${displayName(profile.user)} applied as a trainer`,
    message: "Review the profile, required Facebook Page, schedule, rate, and payment readiness.",
    actionUrl: appUrl("/dashboard/admin/trainers"),
    actionLabel: "Review trainer",
    idempotencyKey: `trainer-application-${profile.id}-${submittedAt.getTime()}-${admin.email}`,
  })));
  revalidateTrainerPaths(profile.user.username);
  return { success: "Application submitted for admin review." };
}

export async function requestTrainerSessionAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Sign in as a player to request training." };
  const parsed = TrainerRequestSchema.safeParse({
    trainerProfileId: String(formData.get("trainerProfileId") ?? ""),
    date: String(formData.get("date") ?? ""),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const today = manilaToday();
  if (parsed.data.date < today || parsed.data.date > addDays(today, TRAINER_BOOKING_WINDOW_DAYS)) {
    return { errors: { date: `Choose a date within the next ${TRAINER_BOOKING_WINDOW_DAYS} days` } };
  }
  const startsAt = manilaInstant(parsed.data.date, parsed.data.startHour);
  if (startsAt.getTime() - Date.now() < TRAINER_MIN_LEAD_HOURS * 3_600_000) {
    return { errors: { date: `Trainer requests need at least ${TRAINER_MIN_LEAD_HOURS} hours' notice` } };
  }
  const profile = await prisma.trainerProfile.findUnique({
    where: { id: parsed.data.trainerProfileId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          playerName: true,
          privateProfile: true,
          trainerGateway: { select: { disconnectedAt: true } },
          trainerManualMethods: { where: { active: true }, take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!profile || profile.status !== "ACTIVE" || profile.user.privateProfile || !profile.hourlyRate || !trainerPaymentReady(profile)) {
    return { message: "This trainer is not accepting requests right now." };
  }
  if (await isTrainerServiceFeeOverdue(profile.userId)) {
    return {
      message:
        "This trainer is temporarily unavailable while a service-fee balance is being settled.",
    };
  }
  if (profile.userId === viewer.id) return { message: "You cannot request your own trainer profile." };
  const available = await getTrainerAvailability(profile.id, parsed.data.date);
  if (!rangeAvailable(available, parsed.data.startHour, parsed.data.endHour)) {
    return { message: "One of those hours is no longer available." };
  }
  const hours = parsed.data.endHour - parsed.data.startHour;
  const hourlyRate = Number(profile.hourlyRate);
  const trainerAmount = Math.round(hourlyRate * hours * 100) / 100;
  const platformFee = trainerServiceFeeFor(trainerAmount);
  const totalAmount = Math.round((trainerAmount + platformFee) * 100) / 100;
  const requestExpiresAt = new Date(Date.now() + TRAINER_REQUEST_HOLD_HOURS * 3_600_000);
  let sessionId: string;
  try {
    const session = await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.trainerSessionSlot.deleteMany({
        where: {
          trainerProfileId: profile.id,
          date: parsed.data.date,
          session: {
            OR: [
              { status: "REQUESTED", requestExpiresAt: { lte: now } },
              { status: "AWAITING_PAYMENT", paymentExpiresAt: { lte: now } },
              { status: { in: ["DECLINED", "EXPIRED", "CANCELLED", "COMPLETED", "REFUNDED"] } },
            ],
          },
        },
      });
      const created = await tx.trainerSession.create({
        data: {
          publicId: crypto.randomBytes(12).toString("base64url"),
          trainerProfileId: profile.id,
          playerId: viewer.id,
          date: parsed.data.date,
          startHour: parsed.data.startHour,
          endHour: parsed.data.endHour,
          hours,
          startsAt,
          endsAt: manilaInstant(parsed.data.date, parsed.data.endHour),
          notes: parsed.data.notes,
          hourlyRate: new Prisma.Decimal(hourlyRate),
          trainerAmount: new Prisma.Decimal(trainerAmount),
          platformFee: new Prisma.Decimal(platformFee),
          totalAmount: new Prisma.Decimal(totalAmount),
          requestExpiresAt,
        },
        select: { id: true },
      });
      await tx.trainerSessionSlot.createMany({
        data: Array.from({ length: hours }, (_, index) => ({
          trainerProfileId: profile.id,
          trainerSessionId: created.id,
          date: parsed.data.date,
          hour: parsed.data.startHour + index,
        })),
      });
      return created;
    });
    sessionId = session.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { message: "Another player just requested one of those hours." };
    }
    throw error;
  }
  const player = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { email: true, name: true, playerName: true },
  });
  if (player) {
    await Promise.all([
      notify({
        to: profile.user.email,
        recipientName: displayName(profile.user),
        subject: "New trainer-session request",
        heading: "A player requested your time",
        message: `${displayName(player)} requested ${hours} ${hours === 1 ? "hour" : "hours"}. Respond within ${TRAINER_REQUEST_HOLD_HOURS} hours.`,
        actionUrl: appUrl("/dashboard/trainer/sessions"),
        actionLabel: "Review request",
        idempotencyKey: `trainer-request-${sessionId}-trainer`,
      }),
      notify({
        to: player.email,
        recipientName: displayName(player),
        subject: "Trainer request sent",
        heading: "Your request is with the trainer",
        message: `${displayName(profile.user)} has ${TRAINER_REQUEST_HOLD_HOURS} hours to respond. You will pay only after acceptance.`,
        actionUrl: appUrl("/dashboard/bookings"),
        actionLabel: "View request",
        idempotencyKey: `trainer-request-${sessionId}-player`,
      }),
    ]);
  }
  revalidateTrainerPaths();
  return { success: "Request sent. The trainer has 12 hours to respond.", sessionId };
}

export async function decideTrainerSessionAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Player account required." };
  const parsed = TrainerDecisionSchema.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const session = await prisma.trainerSession.findFirst({
    where: { id: parsed.data.sessionId, trainer: { userId: viewer.id } },
    include: {
      trainer: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              playerName: true,
              trainerGateway: { select: { id: true, disconnectedAt: true } },
              trainerManualMethods: {
                where: { active: true },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
      player: { select: { email: true, name: true, playerName: true } },
    },
  });
  if (!session || session.status !== "REQUESTED" || session.requestExpiresAt <= new Date()) {
    return { message: "That request is no longer awaiting a decision." };
  }
  if (parsed.data.decision === "DECLINE") {
    await prisma.$transaction([
      prisma.trainerSession.update({
        where: { id: session.id },
        data: { status: "DECLINED", declinedAt: new Date(), declineReason: parsed.data.reason },
      }),
      prisma.trainerSessionSlot.deleteMany({ where: { trainerSessionId: session.id } }),
    ]);
    await notify({
      to: session.player.email,
      recipientName: displayName(session.player),
      subject: "Trainer request declined",
      heading: "Your trainer request was declined",
      message: parsed.data.reason ?? "The trainer is unavailable for this request.",
      actionUrl: appUrl("/trainers"),
      actionLabel: "Find another trainer",
      idempotencyKey: `trainer-declined-${session.id}`,
    });
    revalidateTrainerPaths();
    return { success: "Request declined and the player notified." };
  }
  if (!trainerPaymentReady(session.trainer)) {
    return { message: "Your selected payment setup is not ready." };
  }
  const paymentExpiresAt = new Date(Date.now() + TRAINER_PAYMENT_HOLD_MINUTES * 60_000);
  const automatic = session.trainer.paymentMode === "AUTOMATIC";
  const processingFee = automatic
    ? paymongoQrPhProcessingFeeFor(Number(session.totalAmount))
    : 0;
  const amount = Math.round((Number(session.totalAmount) + processingFee) * 100) / 100;
  const manual = session.trainer.user.trainerManualMethods[0] ?? null;
  const payment = await prisma.$transaction(async (tx) => {
    const updated = await tx.trainerSession.updateMany({
      where: { id: session.id, status: "REQUESTED", requestExpiresAt: { gt: new Date() } },
      data: {
        status: "AWAITING_PAYMENT",
        acceptedAt: new Date(),
        paymentExpiresAt,
        processingFee: new Prisma.Decimal(processingFee),
        totalAmount: new Prisma.Decimal(amount),
      },
    });
    if (updated.count !== 1) return null;
    return tx.trainerPayment.create({
      data: {
        trainerSessionId: session.id,
        trainerId: viewer.id,
        playerId: session.playerId,
        gatewayId: automatic ? session.trainer.user.trainerGateway?.id : null,
        manualPaymentMethodId: manual?.id,
        amount: new Prisma.Decimal(amount),
        trainerAmount: session.trainerAmount,
        platformFee: session.platformFee,
        processingFee: new Prisma.Decimal(processingFee),
        method: automatic ? "QRPH" : (manual?.network ?? "MANUAL"),
        collectionMode: automatic ? "AUTOMATIC" : "MANUAL",
        expiresAt: paymentExpiresAt,
        provider: automatic ? "paymongo" : "manual",
        manualMethodLabel: manual?.label,
        manualAccountName: manual?.accountName,
        manualAccountDetails: manual?.accountIdentifier,
        manualInstructions: manual?.instructions,
        manualQrImage: manual?.qrImage,
      },
      select: { id: true },
    });
  });
  if (!payment) return { message: "That request changed while you were responding." };
  await notify({
    to: session.player.email,
    recipientName: displayName(session.player),
    subject: "Trainer request accepted — payment due",
    heading: "Your trainer accepted",
    message: `Complete payment within ${TRAINER_PAYMENT_HOLD_MINUTES} minutes to confirm the session.`,
    actionUrl: appUrl(`/dashboard/trainer-payments/${payment.id}`),
    actionLabel: "Pay now",
    idempotencyKey: `trainer-accepted-${session.id}`,
  });
  revalidateTrainerPaths();
  return { success: "Request accepted. The player has one hour to pay.", paymentId: payment.id };
}

export async function rescheduleTrainerSessionAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Trainer account required." };
  const parsed = TrainerRescheduleSchema.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    date: String(formData.get("date") ?? ""),
    startHour: formData.get("startHour"),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const session = await prisma.trainerSession.findFirst({
    where: { id: parsed.data.sessionId, trainer: { userId: viewer.id } },
    include: { player: { select: { email: true, name: true, playerName: true } } },
  });
  if (!session || session.status !== "CONFIRMED" || session.endsAt <= new Date()) {
    return { message: "Only upcoming confirmed sessions can be moved." };
  }
  const endHour = parsed.data.startHour + session.hours;
  if (endHour > 24) return { errors: { startHour: "That session would end after midnight" } };
  const available = await getTrainerAvailability(session.trainerProfileId, parsed.data.date);
  const ownHours =
    parsed.data.date === session.date
      ? Array.from({ length: session.hours }, (_, index) => session.startHour + index)
      : [];
  if (!rangeAvailable([...new Set([...available, ...ownHours])], parsed.data.startHour, endHour)) {
    return { message: "The new time is not available." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.trainerSessionSlot.deleteMany({ where: { trainerSessionId: session.id } });
      await tx.trainerSession.update({
        where: { id: session.id },
        data: {
          prevDate: session.date,
          prevStartHour: session.startHour,
          prevEndHour: session.endHour,
          date: parsed.data.date,
          startHour: parsed.data.startHour,
          endHour,
          startsAt: manilaInstant(parsed.data.date, parsed.data.startHour),
          endsAt: manilaInstant(parsed.data.date, endHour),
          rescheduledAt: new Date(),
          rescheduledById: viewer.id,
          rescheduleReason: parsed.data.reason,
          rescheduleCount: { increment: 1 },
          reminderSentAt: null,
        },
      });
      await tx.trainerSessionSlot.createMany({
        data: Array.from({ length: session.hours }, (_, index) => ({
          trainerProfileId: session.trainerProfileId,
          trainerSessionId: session.id,
          date: parsed.data.date,
          hour: parsed.data.startHour + index,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { message: "Another request just claimed that time." };
    }
    throw error;
  }
  await notify({
    to: session.player.email,
    recipientName: displayName(session.player),
    subject: "Trainer session rescheduled",
    heading: "Your trainer moved the session",
    message: parsed.data.reason,
    actionUrl: appUrl("/dashboard/bookings"),
    actionLabel: "View new schedule",
    idempotencyKey: `trainer-rescheduled-${session.id}-${session.rescheduleCount + 1}`,
  });
  revalidateTrainerPaths();
  return { success: "Session moved and the player notified." };
}

export async function cancelTrainerSessionAction(
  _previous: TrainerActionState,
  formData: FormData
): Promise<TrainerActionState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Player account required." };
  const parsed = TrainerCancelSchema.safeParse({
    sessionId: String(formData.get("sessionId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const session = await prisma.trainerSession.findFirst({
    where: {
      id: parsed.data.sessionId,
      OR: [{ playerId: viewer.id }, { trainer: { userId: viewer.id } }],
      status: { in: ["REQUESTED", "AWAITING_PAYMENT", "PAYMENT_REVIEW", "CONFIRMED"] },
    },
    include: {
      trainer: { include: { user: { select: { id: true, email: true, name: true, playerName: true } } } },
      player: { select: { id: true, email: true, name: true, playerName: true } },
      payment: { select: { id: true, status: true, collectionMode: true } },
    },
  });
  if (!session) return { message: "Session not found or already closed." };
  const trainerCancelled = session.trainer.userId === viewer.id;
  const refundablePlayerCancellation =
    !trainerCancelled && session.startsAt.getTime() - Date.now() >= 24 * 3_600_000;
  if (session.payment?.status === "SUCCEEDED") {
    return {
      message: trainerCancelled || refundablePlayerCancellation
        ? "This paid session needs a refund. Use the session refund control in Payments."
        : "This session is inside the 24-hour non-refundable window.",
    };
  }
  await prisma.$transaction([
    prisma.trainerSession.update({
      where: { id: session.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: trainerCancelled ? "PARTNER" : "PLAYER",
        cancelReason: parsed.data.reason,
      },
    }),
    prisma.trainerSessionSlot.deleteMany({ where: { trainerSessionId: session.id } }),
    ...(session.payment
      ? [
          prisma.trainerPayment.update({
            where: { id: session.payment.id },
            data: { status: "FAILED", failureCode: "cancelled", failureMessage: parsed.data.reason },
          }),
        ]
      : []),
  ]);
  const recipient = trainerCancelled ? session.player : session.trainer.user;
  await notify({
    to: recipient.email,
    recipientName: displayName(recipient),
    subject: "Trainer session cancelled",
    heading: "The trainer session was cancelled",
    message: parsed.data.reason,
    actionUrl: appUrl(trainerCancelled ? "/dashboard/bookings" : "/dashboard/trainer/sessions"),
    actionLabel: "View sessions",
    idempotencyKey: `trainer-cancelled-${session.id}`,
  });
  revalidateTrainerPaths();
  return { success: "Session cancelled and the time released." };
}

export async function decideTrainerApplicationAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = TrainerAdminDecisionSchema.safeParse({
    trainerProfileId: String(formData.get("trainerProfileId") ?? ""),
    action: String(formData.get("action") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return;
  const profile = await prisma.trainerProfile.findUnique({
    where: { id: parsed.data.trainerProfileId },
    include: {
      weeklyRules: { select: { id: true } },
      user: {
        select: {
          email: true,
          name: true,
          playerName: true,
          username: true,
          image: true,
          phone: true,
          trainerGateway: { select: { disconnectedAt: true } },
          trainerManualMethods: { where: { active: true }, take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!profile) return;
  const approving = parsed.data.action === "APPROVE";
  if (approving) {
    const complete = profile.status === "PENDING" && profile.bio && profile.sports.length > 0 && profile.specialties.length > 0 && profile.experience && profile.area && profile.locationDetails && profile.hourlyRate && profile.facebookPage && profile.user.username && profile.user.image && profile.user.phone && profile.weeklyRules.length > 0 && trainerPaymentReady(profile);
    if (!complete) return;
  }
  const changed = await prisma.trainerProfile.updateMany({
    where: { id: profile.id, ...(approving ? { status: "PENDING" } : { status: { not: "DEACTIVATED" } }) },
    data: approving
      ? {
          status: "ACTIVE",
          activatedAt: new Date(),
          activatedById: admin.id,
          facebookReviewedAt: new Date(),
          facebookReviewedById: admin.id,
          deactivatedAt: null,
          deactivationReason: null,
        }
      : {
          status: "DEACTIVATED",
          deactivatedAt: new Date(),
          deactivationReason: parsed.data.reason,
      },
  });
  if (changed.count !== 1) return;
  await notify({
    to: profile.user.email,
    recipientName: displayName(profile.user),
    subject: approving ? "Trainer profile approved" : "Trainer profile deactivated",
    heading: approving ? "Your trainer profile is live" : "Your trainer profile is paused",
    message: approving
      ? "Players can now discover your profile and request available times."
      : parsed.data.reason ?? "Your trainer profile was paused by an administrator.",
    actionUrl: appUrl("/dashboard/trainer"),
    actionLabel: "Open trainer dashboard",
    idempotencyKey: `trainer-admin-${profile.id}-${approving ? "active" : "deactivated"}-${profile.submittedAt?.getTime() ?? profile.updatedAt.getTime()}`,
  });
  revalidateTrainerPaths(profile.user.username);
}
