import "server-only";

import type {
  PaymentCollectionMode,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
  TrainerSessionStatus,
} from "@prisma/client";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const ADMIN_TRAINER_BOOKING_PAGE_SIZE = 20;

export type AdminTrainerBooking = {
  id: string;
  publicId: string;
  trainer: string;
  trainerEmail: string;
  player: string;
  playerEmail: string;
  date: string;
  startHour: number;
  endHour: number;
  hours: number;
  status: TrainerSessionStatus;
  totalAmount: number;
  trainerAmount: number;
  platformFee: number;
  paymentStatus: PaymentStatus | null;
  paymentMethod: PaymentMethodType | null;
  collectionMode: PaymentCollectionMode | null;
  paymentReference: string | null;
  createdAt: Date;
};

export type AdminTrainerBookingPage = {
  items: AdminTrainerBooking[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

const bookingSelect = {
  id: true,
  publicId: true,
  date: true,
  startHour: true,
  endHour: true,
  hours: true,
  status: true,
  totalAmount: true,
  trainerAmount: true,
  platformFee: true,
  createdAt: true,
  trainer: {
    select: {
      user: { select: { name: true, playerName: true, email: true } },
    },
  },
  player: { select: { name: true, playerName: true, email: true } },
  payment: {
    select: {
      status: true,
      method: true,
      collectionMode: true,
      providerRef: true,
      manualPaymentRef: true,
      providerPaymentId: true,
    },
  },
} satisfies Prisma.TrainerSessionSelect;

type BookingRow = Prisma.TrainerSessionGetPayload<{
  select: typeof bookingSelect;
}>;

function displayName(user: {
  name: string | null;
  playerName: string | null;
  email: string;
}): string {
  return user.playerName ?? user.name ?? user.email;
}

function mapBooking(row: BookingRow): AdminTrainerBooking {
  return {
    id: row.id,
    publicId: row.publicId,
    trainer: displayName(row.trainer.user),
    trainerEmail: row.trainer.user.email,
    player: displayName(row.player),
    playerEmail: row.player.email,
    date: row.date,
    startHour: row.startHour,
    endHour: row.endHour,
    hours: row.hours,
    status: row.status,
    totalAmount: Number(row.totalAmount),
    trainerAmount: Number(row.trainerAmount),
    platformFee: Number(row.platformFee),
    paymentStatus: row.payment?.status ?? null,
    paymentMethod: row.payment?.method ?? null,
    collectionMode: row.payment?.collectionMode ?? null,
    paymentReference:
      row.payment?.providerRef ??
      row.payment?.manualPaymentRef ??
      row.payment?.providerPaymentId ??
      null,
    createdAt: row.createdAt,
  };
}

export async function listAdminTrainerBookings(options: {
  query?: string;
  status?: TrainerSessionStatus;
  from?: string;
  to?: string;
  page: number;
}): Promise<AdminTrainerBookingPage> {
  await requireAdmin();
  const query = options.query?.trim().slice(0, 100) ?? "";
  const contains = { contains: query, mode: "insensitive" as const };
  const where: Prisma.TrainerSessionWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.from || options.to
      ? {
          date: {
            ...(options.from ? { gte: options.from } : {}),
            ...(options.to ? { lte: options.to } : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { id: contains },
            { publicId: contains },
            {
              trainer: {
                user: {
                  OR: [
                    { name: contains },
                    { playerName: contains },
                    { email: contains },
                  ],
                },
              },
            },
            {
              player: {
                OR: [
                  { name: contains },
                  { playerName: contains },
                  { email: contains },
                ],
              },
            },
            { payment: { is: { providerRef: contains } } },
            { payment: { is: { manualPaymentRef: contains } } },
            { payment: { is: { providerPaymentId: contains } } },
          ],
        }
      : {}),
  };

  const total = await prisma.trainerSession.count({ where });
  const pageCount = Math.max(
    1,
    Math.ceil(total / ADMIN_TRAINER_BOOKING_PAGE_SIZE)
  );
  const page = Math.min(Math.max(1, options.page), pageCount);
  const rows = await prisma.trainerSession.findMany({
    where,
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * ADMIN_TRAINER_BOOKING_PAGE_SIZE,
    take: ADMIN_TRAINER_BOOKING_PAGE_SIZE,
    select: bookingSelect,
  });

  return {
    items: rows.map(mapBooking),
    page,
    pageCount,
    pageSize: ADMIN_TRAINER_BOOKING_PAGE_SIZE,
    total,
  };
}
