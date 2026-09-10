import "server-only";

import type {
  PaymentCollectionMode,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const ADMIN_TRANSACTION_PAGE_SIZE = 20;

export type AdminVenueTransaction = {
  id: string;
  reference: string;
  payer: string;
  payerEmail: string | null;
  venue: string;
  item: string;
  amount: number;
  venueAmount: number;
  platformFee: number;
  status: PaymentStatus;
  method: PaymentMethodType;
  collectionMode: PaymentCollectionMode;
  paidAt: Date | null;
  createdAt: Date;
};

export type AdminVenueTransactionPage = {
  items: AdminVenueTransaction[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

const transactionSelect = {
  id: true,
  providerRef: true,
  providerPaymentId: true,
  manualPaymentRef: true,
  amount: true,
  venueAmount: true,
  platformFee: true,
  status: true,
  method: true,
  collectionMode: true,
  paidAt: true,
  createdAt: true,
  partner: { select: { name: true, email: true } },
  user: { select: { name: true, playerName: true, email: true } },
  guestReservation: { select: { name: true, email: true } },
  bookings: {
    orderBy: { createdAt: "asc" },
    select: {
      date: true,
      court: { select: { name: true } },
      hub: { select: { name: true } },
    },
  },
  eventRegistration: {
    select: {
      event: {
        select: {
          title: true,
          date: true,
          hub: { select: { name: true } },
        },
      },
    },
  },
  eventGuestSlots: {
    take: 1,
    select: {
      registration: {
        select: {
          event: {
            select: {
              title: true,
              date: true,
              hub: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BookingPaymentSelect;

type TransactionRow = Prisma.BookingPaymentGetPayload<{
  select: typeof transactionSelect;
}>;

function mapTransaction(row: TransactionRow): AdminVenueTransaction {
  const booking = row.bookings[0];
  const event =
    row.eventRegistration?.event ??
    row.eventGuestSlots[0]?.registration.event ??
    null;
  const bookingSuffix =
    row.bookings.length > 1 ? ` +${row.bookings.length - 1} more` : "";

  return {
    id: row.id,
    reference:
      row.providerRef ??
      row.manualPaymentRef ??
      row.providerPaymentId ??
      row.id,
    payer:
      row.user?.playerName ??
      row.user?.name ??
      row.guestReservation?.name ??
      "Deleted player",
    payerEmail: row.user?.email ?? row.guestReservation?.email ?? null,
    venue:
      booking?.hub.name ??
      event?.hub.name ??
      row.partner.name ??
      row.partner.email,
    item: booking
      ? `${booking.court.name} · ${booking.date}${bookingSuffix}`
      : event
        ? `${event.title} · ${event.date}`
        : "Unlinked payment",
    amount: Number(row.amount),
    venueAmount: Number(row.venueAmount),
    platformFee: Number(row.platformFee),
    status: row.status,
    method: row.method,
    collectionMode: row.collectionMode,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

export async function listAdminVenueTransactions(options: {
  query?: string;
  page: number;
}): Promise<AdminVenueTransactionPage> {
  await requireAdmin();
  const query = options.query?.trim().slice(0, 100) ?? "";
  const contains = { contains: query, mode: "insensitive" as const };
  const where: Prisma.BookingPaymentWhereInput = query
    ? {
        OR: [
          { id: contains },
          { providerRef: contains },
          { providerPaymentId: contains },
          { manualPaymentRef: contains },
          {
            user: {
              is: {
                OR: [
                  { name: contains },
                  { playerName: contains },
                  { email: contains },
                ],
              },
            },
          },
          {
            guestReservation: {
              is: { OR: [{ name: contains }, { email: contains }] },
            },
          },
          {
            partner: {
              is: { OR: [{ name: contains }, { email: contains }] },
            },
          },
          { bookings: { some: { hub: { name: contains } } } },
          {
            eventRegistration: {
              is: { event: { title: contains } },
            },
          },
          {
            eventGuestSlots: {
              some: { registration: { event: { title: contains } } },
            },
          },
        ],
      }
    : {};

  const total = await prisma.bookingPayment.count({ where });
  const pageCount = Math.max(
    1,
    Math.ceil(total / ADMIN_TRANSACTION_PAGE_SIZE)
  );
  const page = Math.min(Math.max(1, options.page), pageCount);
  const rows = await prisma.bookingPayment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * ADMIN_TRANSACTION_PAGE_SIZE,
    take: ADMIN_TRANSACTION_PAGE_SIZE,
    select: transactionSelect,
  });

  return {
    items: rows.map(mapTransaction),
    page,
    pageCount,
    pageSize: ADMIN_TRANSACTION_PAGE_SIZE,
    total,
  };
}
