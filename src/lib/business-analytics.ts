import "server-only";

import type { Prisma } from "@prisma/client";

import type { OperatingHours, Weekday } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { dayWindow, weekdayIndexForDate } from "@/lib/slots";
import {
  addDays,
  manilaDateOf,
  manilaInstant,
  manilaMonthOf,
  manilaToday,
} from "@/lib/time";

export type AnalyticsSource = "all" | "court" | "event" | "trainer";
export type AnalyticsMode = "all" | "AUTOMATIC" | "MANUAL";

export type BusinessAnalyticsFilters = {
  from: string;
  to: string;
  compare: boolean;
  partnerId?: string;
  hubId?: string;
  courtId?: string;
  sport?: string;
  source: AnalyticsSource;
  mode: AnalyticsMode;
};

export type AnalyticsKpis = {
  gross: number;
  salesRevenue: number;
  refunds: number;
  netRevenue: number;
  serviceFees: number;
  recipientShare: number;
  transactions: number;
  utilizationRate: number;
  estimatedUtilization: boolean;
  newCustomers: number;
  retentionRate: number;
};

export type AnalyticsTrendPoint = {
  bucket: string;
  label: string;
  gross: number;
  refunds: number;
  net: number;
};

export type UtilizationRow = {
  courtId: string;
  court: string;
  hubId: string;
  hub: string;
  partnerId: string;
  partner: string;
  sport: string;
  bookedHours: number;
  availableHours: number;
  utilizationRate: number;
  estimated: boolean;
};

export type EventPerformanceRow = {
  eventId: string;
  title: string;
  hub: string;
  date: string;
  paidSpots: number;
  checkoutTotal: number;
  revenue: number;
  grossPaymentFees: number;
  processingFees: number;
  serviceFees: number;
  transactions: number;
  payments: EventPaymentBreakdownRow[];
};

export type EventPaymentBreakdownRow = {
  paymentId: string;
  reference: string;
  paidAt: string;
  status: "SUCCEEDED" | "REFUNDED";
  collectionMode: "AUTOMATIC" | "MANUAL";
  spots: number;
  checkoutTotal: number;
  venueRevenue: number;
  grossPaymentFees: number;
  processingFees: number;
  netBunalRevenue: number;
};

export type TrainerPerformanceRow = {
  trainerId: string;
  trainer: string;
  sessions: number;
  revenue: number;
  serviceFees: number;
};

export type BusinessAnalyticsData = {
  filters: BusinessAnalyticsFilters;
  previousRange: { from: string; to: string };
  kpis: AnalyticsKpis;
  previousKpis: AnalyticsKpis | null;
  trend: AnalyticsTrendPoint[];
  revenueBySource: {
    court: number;
    event: number;
    trainer: number;
  };
  utilization: UtilizationRow[];
  peakHours: { weekday: number; hour: number; bookedHours: number }[];
  customers: {
    active: number;
    newCustomers: number;
    returning: number;
    retainedWithin30Days: number;
    retentionRate: number;
  };
  events: EventPerformanceRow[];
  trainers: TrainerPerformanceRow[];
};

export type AnalyticsOption = {
  id: string;
  name: string;
  description?: string;
};

export type AnalyticsFilterOptions = {
  partners: AnalyticsOption[];
  hubs: (AnalyticsOption & { partnerId: string })[];
  courts: (AnalyticsOption & {
    hubId: string;
    sport: string | null;
  })[];
  sports: string[];
};

type NormalizedPayment = {
  id: string;
  source: Exclude<AnalyticsSource, "all">;
  paidAt: Date;
  refundedAt: Date | null;
  gross: number;
  recipientShare: number;
  serviceFee: number;
  grossRefund: number;
  recipientRefund: number;
  serviceFeeRefund: number;
  userId: string;
  collectionMode: "AUTOMATIC" | "MANUAL";
  paymentStatus?: "SUCCEEDED" | "REFUNDED";
  paymentReference?: string;
  checkoutTotal?: number;
  grossServiceFee?: number;
  absorbedProcessingFee?: number;
  spotCount?: number;
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  hubName?: string;
  trainerId?: string;
  trainerName?: string;
};

type OrganizerEventFee = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  hubName: string;
  amount: number;
  createdAt: Date;
};

const weekdayKeys: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

function dateCount(from: string, to: string): number {
  return Math.max(
    1,
    Math.round(
      (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
        86_400_000
    ) + 1
  );
}

export function previousAnalyticsRange(from: string, to: string) {
  const days = dateCount(from, to);
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

function isInRange(date: Date | null, from: string, to: string) {
  if (!date) return false;
  const civil = manilaDateOf(date);
  return civil >= from && civil <= to;
}

function money(value: unknown): number {
  return value == null ? 0 : Number(value);
}

function paymentMatchesMode(
  collectionMode: string,
  mode: AnalyticsMode
) {
  return mode === "all" || collectionMode === mode;
}

function eventFromPayment(payment: {
  eventRegistration: null | {
    event: {
      id: string;
      title: string;
      date: string;
      sport: string;
      hub: { name: string };
      courts: { courtId: string }[];
    };
  };
  eventGuestSlots: {
    registration: {
      event: {
        id: string;
        title: string;
        date: string;
        sport: string;
        hub: { name: string };
        courts: { courtId: string }[];
      };
    };
  }[];
}) {
  return (
    payment.eventRegistration?.event ??
    payment.eventGuestSlots[0]?.registration.event ??
    null
  );
}

async function venuePayments(
  filters: BusinessAnalyticsFilters
): Promise<NormalizedPayment[]> {
  if (filters.source === "trainer") return [];

  const payments = await prisma.bookingPayment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "REFUNDED"] },
      paidAt: { not: null },
      ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
      ...(filters.hubId ? { hubId: filters.hubId } : {}),
    },
    select: {
      id: true,
      userId: true,
      guestReservationId: true,
      amount: true,
      venueAmount: true,
      platformFee: true,
      processingFee: true,
      processingFeeResponsibility: true,
      collectionMode: true,
      status: true,
      providerRef: true,
      paidAt: true,
      refundedAt: true,
      bookings: {
        select: {
          totalPrice: true,
          court: { select: { id: true, sport: true } },
          hub: { select: { name: true } },
        },
      },
      eventRegistration: {
        select: {
          event: {
            select: {
              id: true,
              title: true,
              date: true,
              sport: true,
              hub: { select: { name: true } },
              courts: { select: { courtId: true } },
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
                  id: true,
                  title: true,
                  date: true,
                  sport: true,
                  hub: { select: { name: true } },
                  courts: { select: { courtId: true } },
                },
              },
            },
          },
        },
      },
      _count: { select: { eventGuestSlots: true } },
    },
  });

  const out: NormalizedPayment[] = [];
  for (const payment of payments) {
    if (!payment.paidAt || !paymentMatchesMode(payment.collectionMode, filters.mode)) {
      continue;
    }
    const event = eventFromPayment(payment);
    const source = event ? "event" : "court";
    if (filters.source !== "all" && filters.source !== source) continue;

    let ratio = 1;
    if (event) {
      if (filters.sport && event.sport !== filters.sport) continue;
      if (
        filters.courtId &&
        !event.courts.some((court) => court.courtId === filters.courtId)
      ) {
        continue;
      }
    } else {
      const allValue = payment.bookings.reduce(
        (sum, booking) => sum + money(booking.totalPrice),
        0
      );
      const selectedValue = payment.bookings
        .filter(
          (booking) =>
            (!filters.courtId || booking.court.id === filters.courtId) &&
            (!filters.sport || booking.court.sport === filters.sport)
        )
        .reduce((sum, booking) => sum + money(booking.totalPrice), 0);
      if ((filters.courtId || filters.sport) && selectedValue === 0) continue;
      if ((filters.courtId || filters.sport) && allValue > 0) {
        ratio = selectedValue / allValue;
      }
    }

    const recipientShare = money(payment.venueAmount) * ratio;
    const grossServiceFee = money(payment.platformFee) * ratio;
    const absorbedProcessingFee =
      payment.processingFeeResponsibility === "BUNAL"
        ? money(payment.processingFee) * ratio
        : 0;
    const serviceFee = grossServiceFee - absorbedProcessingFee;
    out.push({
      id: payment.id,
      source,
      paidAt: payment.paidAt,
      refundedAt: payment.refundedAt,
      gross: recipientShare + grossServiceFee,
      recipientShare,
      serviceFee,
      grossRefund: payment.refundedAt ? recipientShare : 0,
      recipientRefund: payment.refundedAt ? recipientShare : 0,
      serviceFeeRefund: 0,
      userId:
        payment.userId ?? `guest:${payment.guestReservationId ?? payment.id}`,
      collectionMode: payment.collectionMode,
      ...(event
        ? {
            paymentStatus:
              payment.status === "REFUNDED" ? "REFUNDED" : "SUCCEEDED",
            paymentReference: payment.providerRef ?? payment.id,
            checkoutTotal:
              money(payment.amount) +
              (payment.processingFeeResponsibility === "PLAYER"
                ? money(payment.processingFee)
                : 0),
            grossServiceFee,
            absorbedProcessingFee,
            spotCount:
              (payment.eventRegistration ? 1 : 0) +
              payment._count.eventGuestSlots,
            eventId: event.id,
            eventTitle: event.title,
            eventDate: event.date,
            hubName: event.hub.name,
          }
        : { hubName: payment.bookings[0]?.hub.name }),
    });
  }
  return out;
}

async function trainerPayments(
  filters: BusinessAnalyticsFilters
): Promise<NormalizedPayment[]> {
  if (
    filters.source === "court" ||
    filters.source === "event" ||
    filters.partnerId ||
    filters.hubId ||
    filters.courtId
  ) {
    return [];
  }

  const payments = await prisma.trainerPayment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "REFUNDED"] },
      paidAt: { not: null },
      ...(filters.mode === "all" ? {} : { collectionMode: filters.mode }),
      ...(filters.sport
        ? { session: { trainer: { sports: { has: filters.sport } } } }
        : {}),
    },
    select: {
      id: true,
      playerId: true,
      trainerId: true,
      amount: true,
      trainerAmount: true,
      platformFee: true,
      processingFee: true,
      processingFeeResponsibility: true,
      collectionMode: true,
      paidAt: true,
      refundedAt: true,
      trainer: { select: { name: true, playerName: true } },
    },
  });

  return payments.flatMap((payment) =>
    payment.paidAt
      ? [
          {
            id: payment.id,
            source: "trainer" as const,
            paidAt: payment.paidAt,
            refundedAt: payment.refundedAt,
            gross: money(payment.amount),
            recipientShare: money(payment.trainerAmount),
            serviceFee:
              money(payment.platformFee) -
              (payment.processingFeeResponsibility === "BUNAL"
                ? money(payment.processingFee)
                : 0),
            grossRefund: payment.refundedAt ? money(payment.amount) : 0,
            recipientRefund: payment.refundedAt
              ? money(payment.trainerAmount)
              : 0,
            serviceFeeRefund: payment.refundedAt
              ? money(payment.platformFee)
              : 0,
            userId: payment.playerId,
            collectionMode: payment.collectionMode,
            trainerId: payment.trainerId,
            trainerName:
              payment.trainer.name ?? payment.trainer.playerName ?? "Trainer",
          },
        ]
      : []
  );
}

async function organizerEventFees(
  filters: BusinessAnalyticsFilters
): Promise<OrganizerEventFee[]> {
  if (
    filters.source === "court" ||
    filters.source === "trainer" ||
    filters.mode !== "all"
  ) {
    return [];
  }
  const entries = await prisma.serviceFeeEntry.findMany({
    where: {
      eventOrganizerGuestId: { not: null },
      ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
      eventOrganizerGuest: {
        event: {
          ...(filters.hubId ? { hubId: filters.hubId } : {}),
          ...(filters.sport ? { sport: filters.sport } : {}),
          ...(filters.courtId
            ? { courts: { some: { courtId: filters.courtId } } }
            : {}),
        },
      },
    },
    select: {
      amount: true,
      createdAt: true,
      eventOrganizerGuest: {
        select: {
          event: {
            select: {
              id: true,
              title: true,
              date: true,
              hub: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return entries.flatMap((entry) => {
    const event = entry.eventOrganizerGuest?.event;
    return event
      ? [
          {
            eventId: event.id,
            eventTitle: event.title,
            eventDate: event.date,
            hubName: event.hub.name,
            amount: money(entry.amount),
            createdAt: entry.createdAt,
          },
        ]
      : [];
  });
}

function paymentsInRange(
  payments: NormalizedPayment[],
  from: string,
  to: string
) {
  return payments.filter(
    (payment) =>
      isInRange(payment.paidAt, from, to) ||
      isInRange(payment.refundedAt, from, to)
  );
}

function paymentKpis(
  payments: NormalizedPayment[],
  from: string,
  to: string
) {
  let gross = 0;
  let refunds = 0;
  let serviceFees = 0;
  let salesRevenue = 0;
  let recipientShare = 0;
  let transactions = 0;
  for (const payment of payments) {
    if (isInRange(payment.paidAt, from, to)) {
      gross += payment.gross;
      serviceFees += payment.serviceFee;
      salesRevenue += payment.recipientShare;
      recipientShare += payment.recipientShare;
      transactions += 1;
    }
    if (isInRange(payment.refundedAt, from, to)) {
      refunds += payment.grossRefund;
      recipientShare -= payment.recipientRefund;
      serviceFees -= payment.serviceFeeRefund;
    }
  }
  return {
    gross,
    salesRevenue,
    refunds,
    serviceFees,
    recipientShare,
    transactions,
  };
}

function customerMetrics(
  payments: NormalizedPayment[],
  from: string,
  to: string
) {
  const datesByCustomer = new Map<string, string[]>();
  for (const payment of payments) {
    const dates = datesByCustomer.get(payment.userId) ?? [];
    dates.push(manilaDateOf(payment.paidAt));
    datesByCustomer.set(payment.userId, dates);
  }

  let newCustomers = 0;
  let retainedWithin30Days = 0;
  const active = new Set<string>();
  for (const [customerId, dates] of datesByCustomer) {
    const ordered = [...dates].sort();
    if (ordered.some((date) => date >= from && date <= to)) active.add(customerId);
    const first = ordered[0];
    if (first < from || first > to) continue;
    newCustomers += 1;
    if (
      ordered.slice(1).some(
        (date) => date <= addDays(first, 30)
      )
    ) {
      retainedWithin30Days += 1;
    }
  }

  const returning = [...active].filter((customerId) => {
    const dates = [...(datesByCustomer.get(customerId) ?? [])].sort();
    return dates[0] < from;
  }).length;

  return {
    active: active.size,
    newCustomers,
    returning,
    retainedWithin30Days,
    retentionRate:
      newCustomers > 0 ? (retainedWithin30Days / newCustomers) * 100 : 0,
  };
}

function trendFor(
  payments: NormalizedPayment[],
  from: string,
  to: string
): AnalyticsTrendPoint[] {
  const monthly = dateCount(from, to) > 62;
  const buckets = new Map<string, AnalyticsTrendPoint>();
  let cursor = from;
  while (cursor <= to) {
    const bucket = monthly ? manilaMonthOf(cursor) : cursor;
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        bucket,
        label: monthly
          ? new Intl.DateTimeFormat("en-PH", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            }).format(new Date(`${bucket}-01T12:00:00Z`))
          : new Intl.DateTimeFormat("en-PH", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${bucket}T12:00:00Z`)),
        gross: 0,
        refunds: 0,
        net: 0,
      });
    }
    cursor = addDays(cursor, 1);
  }

  for (const payment of payments) {
    if (isInRange(payment.paidAt, from, to)) {
      const date = manilaDateOf(payment.paidAt);
      const point = buckets.get(monthly ? manilaMonthOf(date) : date);
      if (point) point.gross += payment.gross;
    }
    if (isInRange(payment.refundedAt, from, to) && payment.refundedAt) {
      const date = manilaDateOf(payment.refundedAt);
      const point = buckets.get(monthly ? manilaMonthOf(date) : date);
      if (point) point.refunds += payment.grossRefund;
    }
  }
  for (const point of buckets.values()) point.net = point.gross - point.refunds;
  return [...buckets.values()];
}

type RevisionRule = {
  weekday: number;
  hour: number;
  closed: boolean;
};

function revisionRules(value: Prisma.JsonValue): RevisionRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.weekday === "number" && typeof row.hour === "number"
      ? [
          {
            weekday: row.weekday,
            hour: row.hour,
            closed: row.closed === true,
          },
        ]
      : [];
  });
}

async function utilizationMetrics(filters: BusinessAnalyticsFilters) {
  if (filters.source === "trainer" || filters.partnerId === "__trainers__") {
    return { rows: [] as UtilizationRow[], peakHours: [] as BusinessAnalyticsData["peakHours"] };
  }

  const courts = await prisma.court.findMany({
    where: {
      ...(filters.courtId ? { id: filters.courtId } : {}),
      ...(filters.sport ? { sport: filters.sport } : {}),
      hub: {
        ...(filters.hubId ? { id: filters.hubId } : {}),
        ...(filters.partnerId ? { ownerId: filters.partnerId } : {}),
      },
    },
    select: {
      id: true,
      name: true,
      sport: true,
      hub: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          operatingHours: true,
          owner: { select: { name: true, email: true } },
        },
      },
      scheduleRules: {
        select: { weekday: true, hour: true, closed: true },
      },
      scheduleRevisions: {
        where: {
          effectiveFrom: { lte: filters.to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: filters.from } }],
        },
        orderBy: { effectiveFrom: "asc" },
        select: {
          effectiveFrom: true,
          effectiveTo: true,
          operatingHours: true,
          slotRules: true,
        },
      },
    },
    orderBy: [{ hub: { name: "asc" } }, { name: "asc" }],
  });
  if (courts.length === 0) {
    return { rows: [] as UtilizationRow[], peakHours: [] as BusinessAnalyticsData["peakHours"] };
  }

  const courtIds = courts.map((court) => court.id);
  const slots = await prisma.bookingSlot.findMany({
    where: {
      courtId: { in: courtIds },
      date: { gte: filters.from, lte: filters.to },
      OR: [
        { booking: { status: "CONFIRMED" } },
        { event: { status: "PUBLISHED" } },
      ],
    },
    select: { courtId: true, date: true, hour: true },
  });

  const bookedByCourt = new Map<string, number>();
  const peak = new Map<string, number>();
  for (const slot of slots) {
    bookedByCourt.set(slot.courtId, (bookedByCourt.get(slot.courtId) ?? 0) + 1);
    const key = `${weekdayIndexForDate(slot.date)}:${slot.hour}`;
    peak.set(key, (peak.get(key) ?? 0) + 1);
  }

  const rows: UtilizationRow[] = [];
  for (const court of courts) {
    let availableHours = 0;
    let estimated = false;
    for (let date = filters.from; date <= filters.to; date = addDays(date, 1)) {
      const revision = [...court.scheduleRevisions]
        .reverse()
        .find(
          (item) =>
            item.effectiveFrom <= date &&
            (item.effectiveTo === null || item.effectiveTo >= date)
        );
      const operatingHours = (revision?.operatingHours ??
        court.hub.operatingHours) as OperatingHours | null;
      const rules = revision
        ? revisionRules(revision.slotRules)
        : court.scheduleRules;
      if (!revision) estimated = true;
      const weekday = weekdayIndexForDate(date);
      const key = weekdayKeys[weekday];
      const window = operatingHours && key ? dayWindow(operatingHours[key]) : null;
      if (!window) continue;
      for (let hour = window.start; hour < window.end; hour++) {
        const closed = rules.some(
          (rule) =>
            rule.weekday === weekday && rule.hour === hour && rule.closed
        );
        if (!closed) availableHours += 1;
      }
    }
    const bookedHours = bookedByCourt.get(court.id) ?? 0;
    rows.push({
      courtId: court.id,
      court: court.name,
      hubId: court.hub.id,
      hub: court.hub.name,
      partnerId: court.hub.ownerId,
      partner: court.hub.owner.name ?? court.hub.owner.email,
      sport: court.sport ?? "Unspecified",
      bookedHours,
      availableHours,
      utilizationRate:
        availableHours > 0 ? (bookedHours / availableHours) * 100 : 0,
      estimated,
    });
  }

  return {
    rows,
    peakHours: [...peak.entries()].map(([key, bookedHours]) => {
      const [weekday, hour] = key.split(":").map(Number);
      return { weekday, hour, bookedHours };
    }),
  };
}

function eventPerformance(
  payments: NormalizedPayment[],
  fees: OrganizerEventFee[],
  from: string,
  to: string
) {
  const rows = new Map<string, EventPerformanceRow>();
  for (const payment of payments) {
    if (
      !payment.eventId ||
      (!isInRange(payment.paidAt, from, to) &&
        !isInRange(payment.refundedAt, from, to))
    ) {
      continue;
    }
    const row = rows.get(payment.eventId) ?? {
      eventId: payment.eventId,
      title: payment.eventTitle ?? "Event",
      hub: payment.hubName ?? "Venue",
      date: payment.eventDate ?? "",
      paidSpots: 0,
      checkoutTotal: 0,
      revenue: 0,
      grossPaymentFees: 0,
      processingFees: 0,
      serviceFees: 0,
      transactions: 0,
      payments: [],
    };
    const paidInRange = isInRange(payment.paidAt, from, to);
    const refundedInRange = isInRange(payment.refundedAt, from, to);
    const venueRevenue =
      (paidInRange ? payment.recipientShare : 0) -
      (refundedInRange ? payment.recipientRefund : 0);
    const grossPaymentFees = paidInRange
      ? (payment.grossServiceFee ?? 0)
      : 0;
    const processingFees = paidInRange
      ? (payment.absorbedProcessingFee ?? 0)
      : 0;
    const netBunalRevenue =
      (paidInRange ? payment.serviceFee : 0) -
      (refundedInRange ? payment.serviceFeeRefund : 0);
    if (isInRange(payment.paidAt, from, to)) {
      row.paidSpots += payment.spotCount ?? 0;
      row.checkoutTotal += payment.checkoutTotal ?? payment.gross;
      row.revenue += payment.recipientShare;
      row.grossPaymentFees += payment.grossServiceFee ?? 0;
      row.processingFees += payment.absorbedProcessingFee ?? 0;
      row.serviceFees += payment.serviceFee;
      row.transactions += 1;
    }
    if (isInRange(payment.refundedAt, from, to)) {
      row.revenue -= payment.recipientRefund;
      row.serviceFees -= payment.serviceFeeRefund;
    }
    row.payments.push({
      paymentId: payment.id,
      reference: payment.paymentReference ?? payment.id,
      paidAt: payment.paidAt.toISOString(),
      status: payment.paymentStatus ?? "SUCCEEDED",
      collectionMode: payment.collectionMode,
      spots: payment.spotCount ?? 0,
      checkoutTotal: paidInRange
        ? (payment.checkoutTotal ?? payment.gross)
        : 0,
      venueRevenue,
      grossPaymentFees,
      processingFees,
      netBunalRevenue,
    });
    rows.set(payment.eventId, row);
  }
  for (const fee of fees) {
    if (!isInRange(fee.createdAt, from, to)) continue;
    const row = rows.get(fee.eventId) ?? {
      eventId: fee.eventId,
      title: fee.eventTitle,
      hub: fee.hubName,
      date: fee.eventDate,
      paidSpots: 0,
      checkoutTotal: 0,
      revenue: 0,
      grossPaymentFees: 0,
      processingFees: 0,
      serviceFees: 0,
      transactions: 0,
      payments: [],
    };
    row.grossPaymentFees += fee.amount;
    row.serviceFees += fee.amount;
    rows.set(fee.eventId, row);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      payments: row.payments.sort((a, b) =>
        b.paidAt.localeCompare(a.paidAt)
      ),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function trainerPerformance(payments: NormalizedPayment[], from: string, to: string) {
  const rows = new Map<string, TrainerPerformanceRow>();
  for (const payment of payments) {
    if (
      !payment.trainerId ||
      (!isInRange(payment.paidAt, from, to) &&
        !isInRange(payment.refundedAt, from, to))
    ) {
      continue;
    }
    const row = rows.get(payment.trainerId) ?? {
      trainerId: payment.trainerId,
      trainer: payment.trainerName ?? "Trainer",
      sessions: 0,
      revenue: 0,
      serviceFees: 0,
    };
    if (isInRange(payment.paidAt, from, to)) {
      row.sessions += 1;
      row.revenue += payment.recipientShare;
      row.serviceFees += payment.serviceFee;
    }
    if (isInRange(payment.refundedAt, from, to)) {
      row.revenue -= payment.recipientRefund;
      row.serviceFees -= payment.serviceFeeRefund;
    }
    rows.set(payment.trainerId, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

export async function getBusinessAnalytics(args: {
  audience: "partner" | "owner";
  filters: BusinessAnalyticsFilters;
}): Promise<BusinessAnalyticsData> {
  const previousRange = previousAnalyticsRange(
    args.filters.from,
    args.filters.to
  );
  const [venue, trainer, organizerFees, utilization] = await Promise.all([
    venuePayments(args.filters),
    args.audience === "owner" ? trainerPayments(args.filters) : Promise.resolve([]),
    organizerEventFees(args.filters),
    utilizationMetrics(args.filters),
  ]);
  const payments = [...venue, ...trainer];
  const current = paymentKpis(payments, args.filters.from, args.filters.to);
  current.serviceFees += organizerFees
    .filter((fee) => isInRange(fee.createdAt, args.filters.from, args.filters.to))
    .reduce((sum, fee) => sum + fee.amount, 0);
  const previous = args.filters.compare
    ? paymentKpis(payments, previousRange.from, previousRange.to)
    : null;
  if (previous) {
    previous.serviceFees += organizerFees
      .filter((fee) =>
        isInRange(fee.createdAt, previousRange.from, previousRange.to)
      )
      .reduce((sum, fee) => sum + fee.amount, 0);
  }
  const customers = customerMetrics(payments, args.filters.from, args.filters.to);
  const previousCustomers = args.filters.compare
    ? customerMetrics(payments, previousRange.from, previousRange.to)
    : null;
  const available = utilization.rows.reduce(
    (sum, row) => sum + row.availableHours,
    0
  );
  const booked = utilization.rows.reduce((sum, row) => sum + row.bookedHours, 0);
  const utilizationRate = available > 0 ? (booked / available) * 100 : 0;

  const toKpis = (
    base: ReturnType<typeof paymentKpis>,
    customer: ReturnType<typeof customerMetrics>,
    utilizationValue: number,
    estimated: boolean
  ): AnalyticsKpis => ({
    ...base,
    netRevenue: base.recipientShare,
    utilizationRate: utilizationValue,
    estimatedUtilization: estimated,
    newCustomers: customer.newCustomers,
    retentionRate: customer.retentionRate,
  });

  const revenueBySource = { court: 0, event: 0, trainer: 0 };
  for (const payment of payments) {
    if (isInRange(payment.paidAt, args.filters.from, args.filters.to)) {
      revenueBySource[payment.source] += payment.gross;
    }
  }

  return {
    filters: args.filters,
    previousRange,
    kpis: toKpis(
      current,
      customers,
      utilizationRate,
      utilization.rows.some((row) => row.estimated)
    ),
    previousKpis:
      previous && previousCustomers
        ? toKpis(previous, previousCustomers, 0, true)
        : null,
    trend: trendFor(
      paymentsInRange(payments, args.filters.from, args.filters.to),
      args.filters.from,
      args.filters.to
    ),
    revenueBySource,
    utilization: utilization.rows,
    peakHours: utilization.peakHours,
    customers,
    events: eventPerformance(
      venue,
      organizerFees,
      args.filters.from,
      args.filters.to
    ),
    trainers: trainerPerformance(trainer, args.filters.from, args.filters.to),
  };
}

export async function partnerAnalyticsOptions(
  partnerId: string
): Promise<AnalyticsFilterOptions> {
  const hubs = await prisma.hub.findMany({
    where: { ownerId: partnerId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      ownerId: true,
      games: true,
      courts: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, sport: true },
      },
    },
  });
  return {
    partners: [],
    hubs: hubs.map((hub) => ({
      id: hub.id,
      name: hub.name,
      partnerId: hub.ownerId,
    })),
    courts: hubs.flatMap((hub) =>
      hub.courts.map((court) => ({
        id: court.id,
        name: court.name,
        hubId: hub.id,
        sport: court.sport,
      }))
    ),
    sports: [...new Set(hubs.flatMap((hub) => hub.games))].sort(),
  };
}

export async function ownerAnalyticsOptions(
  selected: {
    partnerId?: string;
    hubId?: string;
    courtId?: string;
  } = {}
): Promise<AnalyticsFilterOptions> {
  const [partner, hub, court, courtSports, trainerSports] = await Promise.all([
    selected.partnerId
      ? prisma.user.findFirst({
          where: { id: selected.partnerId, role: "PARTNER" },
          select: { id: true, name: true, email: true },
        })
      : null,
    selected.hubId
      ? prisma.hub.findFirst({
          where: {
            id: selected.hubId,
            ...(selected.partnerId ? { ownerId: selected.partnerId } : {}),
          },
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: { select: { name: true, email: true } },
          },
        })
      : null,
    selected.courtId
      ? prisma.court.findFirst({
          where: {
            id: selected.courtId,
            ...(selected.hubId ? { hubId: selected.hubId } : {}),
            ...(selected.partnerId
              ? { hub: { ownerId: selected.partnerId } }
              : {}),
          },
          select: {
            id: true,
            name: true,
            sport: true,
            hubId: true,
            hub: { select: { name: true } },
          },
        })
      : null,
    prisma.court.findMany({
      where: { sport: { not: null } },
      distinct: ["sport"],
      select: { sport: true },
    }),
    prisma.trainerProfile.findMany({
      where: { status: "ACTIVE" },
      select: { sports: true },
    }),
  ]);
  return {
    partners: partner
      ? [
          {
            id: partner.id,
            name: partner.name ?? partner.email,
            description: partner.email,
          },
        ]
      : [],
    hubs: hub
      ? [
          {
            id: hub.id,
            name: hub.name,
            partnerId: hub.ownerId,
            description: hub.owner.name ?? hub.owner.email,
          },
        ]
      : [],
    courts: court
      ? [
          {
            id: court.id,
            name: court.name,
            hubId: court.hubId,
            sport: court.sport,
            description: `${court.hub.name}${court.sport ? ` · ${court.sport}` : ""}`,
          },
        ]
      : [],
    sports: [
      ...new Set([
        ...courtSports.flatMap((item) => (item.sport ? [item.sport] : [])),
        ...trainerSports.flatMap((trainer) => trainer.sports),
      ]),
    ].sort(),
  };
}

export async function searchOwnerAnalyticsOptions(args: {
  kind: "partner" | "hub" | "court";
  query?: string;
  partnerId?: string;
  hubId?: string;
  limit?: number;
}): Promise<{ items: AnalyticsOption[]; hasMore: boolean }> {
  const query = args.query?.trim();
  const take = Math.min(Math.max(args.limit ?? 20, 1), 20);

  if (args.kind === "partner") {
    const rows = await prisma.user.findMany({
      where: {
        role: "PARTNER",
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: take + 1,
      select: { id: true, name: true, email: true },
    });
    return {
      items: rows.slice(0, take).map((row) => ({
        id: row.id,
        name: row.name ?? row.email,
        description: row.email,
      })),
      hasMore: rows.length > take,
    };
  }

  if (args.kind === "hub") {
    const rows = await prisma.hub.findMany({
      where: {
        ...(args.partnerId ? { ownerId: args.partnerId } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                {
                  owner: {
                    OR: [
                      { name: { contains: query, mode: "insensitive" } },
                      { email: { contains: query, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: take + 1,
      select: {
        id: true,
        name: true,
        owner: { select: { name: true, email: true } },
      },
    });
    return {
      items: rows.slice(0, take).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.owner.name ?? row.owner.email,
      })),
      hasMore: rows.length > take,
    };
  }

  const rows = await prisma.court.findMany({
    where: {
      ...(args.hubId ? { hubId: args.hubId } : {}),
      ...(args.partnerId ? { hub: { ownerId: args.partnerId } } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { hub: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ hub: { name: "asc" } }, { name: "asc" }],
    take: take + 1,
    select: {
      id: true,
      name: true,
      sport: true,
      hub: { select: { name: true } },
    },
  });
  return {
    items: rows.slice(0, take).map((row) => ({
      id: row.id,
      name: row.name,
      description: `${row.hub.name}${row.sport ? ` · ${row.sport}` : ""}`,
    })),
    hasMore: rows.length > take,
  };
}

export function defaultAnalyticsFilters(
  overrides: Partial<BusinessAnalyticsFilters> = {}
): BusinessAnalyticsFilters {
  const to = manilaToday();
  return {
    from: addDays(to, -29),
    to,
    compare: true,
    source: "all",
    mode: "all",
    ...overrides,
  };
}

export function analyticsWindow(filters: BusinessAnalyticsFilters) {
  return {
    gte: manilaInstant(filters.from, 0),
    lt: manilaInstant(addDays(filters.to, 1), 0),
  };
}
