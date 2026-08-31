import "server-only";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { addDays, manilaDateOf, manilaInstant, manilaMonthOf } from "@/lib/time";

// Revenue over time for venue court bookings and paid event registrations.
//
// Deliberately reads the PAYMENT LEDGER, not the booking table: this answers
// "what money actually moved", which is a different question from "what was
// booked". A venue that settles cash at the counter has real revenue that
// simply isn't in here — see the empty state on the reports page, which says so
// rather than implying a flat zero means no business.

export type RevenueGrain = "day" | "month";

export type RevenuePoint = {
  // "2026-07-29" for a day, "2026-07" for a month.
  bucket: string;
  label: string;
  gross: number;
  // Subtracted on the day the REFUND was issued, never backdated into the
  // month of the sale — that would rewrite a total someone has already read.
  refunds: number;
  net: number;
  count: number;
};

export type RevenueTotals = {
  gross: number;
  refunds: number;
  net: number;
  count: number;
  // Mean per bucket that had any money in it. Averaging over empty days would
  // make a quiet month look like a bad one.
  average: number;
};

export type RevenueSeries = {
  grain: RevenueGrain;
  from: string;
  to: string;
  // Dense: every bucket in the range, zeros included, so the chart's x-axis is
  // real time rather than "days that happened to have a payment".
  points: RevenuePoint[];
  totals: RevenueTotals;
};

export type RevenueRange = {
  // Manila civil dates, inclusive.
  from: string;
  to: string;
  grain: RevenueGrain;
};

// A row shaped the way both ledgers already are.
type LedgerRow = {
  amount: number;
  paidAt: Date | null;
  refundedAt: Date | null;
  refundedAmount: number | null;
};

// Which figure a series is about. A venue's report must never show the gross
// with our service fee folded into it — that is money they never keep.
export type RevenueBasis = "gross" | "venue" | "fee";

const monthLabel = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
const dayLabel = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

function labelFor(bucket: string, grain: RevenueGrain): string {
  return grain === "month"
    ? monthLabel.format(new Date(`${bucket}-01T12:00:00Z`))
    : dayLabel.format(new Date(`${bucket}T12:00:00Z`));
}

// Every bucket between two civil dates, in order. Anchored at UTC noon inside
// addDays, so no offset can skip or repeat one.
function bucketsBetween(range: RevenueRange): string[] {
  const out: string[] = [];
  if (range.grain === "month") {
    let cursor = manilaMonthOf(range.from);
    const last = manilaMonthOf(range.to);
    // Guarded rather than while(true): a bad range must not spin.
    for (let i = 0; i < 240 && cursor <= last; i++) {
      out.push(cursor);
      const [y, m] = cursor.split("-").map(Number);
      cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
    return out;
  }

  let cursor = range.from;
  for (let i = 0; i < 400 && cursor <= range.to; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

const bucketOf = (instant: Date, grain: RevenueGrain) =>
  grain === "month"
    ? manilaMonthOf(manilaDateOf(instant))
    : manilaDateOf(instant);

// The whole of the aggregation, shared by all three sources. Rows are bucketed
// in JS rather than grouped in SQL because Postgres can't date_trunc into
// Manila without a raw query, and correctness matters more here than a
// round-trip. If the volumes ever justify it this becomes one $queryRaw with
// `AT TIME ZONE 'Asia/Manila'` behind the same signature.
function buildSeries(rows: LedgerRow[], range: RevenueRange): RevenueSeries {
  const points = new Map<string, RevenuePoint>();
  for (const bucket of bucketsBetween(range)) {
    points.set(bucket, {
      bucket,
      label: labelFor(bucket, range.grain),
      gross: 0,
      refunds: 0,
      net: 0,
      count: 0,
    });
  }

  for (const row of rows) {
    if (row.paidAt) {
      const point = points.get(bucketOf(row.paidAt, range.grain));
      if (point) {
        point.gross += row.amount;
        point.count += 1;
      }
    }
    if (row.refundedAt) {
      const point = points.get(bucketOf(row.refundedAt, range.grain));
      if (point) {
        // Fall back to the full amount: a refund with no recorded figure is a
        // full one everywhere in this codebase.
        point.refunds += row.refundedAmount ?? row.amount;
      }
    }
  }

  const list = [...points.values()];
  for (const point of list) point.net = point.gross - point.refunds;

  const withMoney = list.filter((p) => p.gross > 0);
  const gross = list.reduce((sum, p) => sum + p.gross, 0);
  const refunds = list.reduce((sum, p) => sum + p.refunds, 0);
  const count = list.reduce((sum, p) => sum + p.count, 0);

  return {
    grain: range.grain,
    from: range.from,
    to: range.to,
    points: list,
    totals: {
      gross,
      refunds,
      net: gross - refunds,
      count,
      average: withMoney.length ? gross / withMoney.length : 0,
    },
  };
}

// The instants a civil-date range covers: 00:00 on `from` through 00:00 the day
// after `to`, both in Manila. Half-open, so a payment at 23:59:59 on the last
// day is in and one a second later is out.
function windowOf(range: RevenueRange) {
  return {
    gte: manilaInstant(range.from, 0),
    lt: manilaInstant(addDays(range.to, 1), 0),
  };
}

// A payment counts if EITHER leg falls in the window — a June sale refunded in
// July has to be fetched when reporting July, or the refund would vanish.
function ledgerWhere(range: RevenueRange) {
  const window = windowOf(range);
  return { OR: [{ paidAt: window }, { refundedAt: window }] };
}

// --- Players paying a venue -------------------------------------------------

type VenueRevenueArgs = {
  partnerId: string;
  hubId?: string;
  range: RevenueRange;
};

async function venueLedgerRows(args: VenueRevenueArgs) {
  return prisma.bookingPayment.findMany({
    where: {
      partnerId: args.partnerId,
      ...(args.hubId ? { hubId: args.hubId } : {}),
      // SUCCEEDED or REFUNDED: a refunded payment still had a sale to reverse.
      status: { in: ["SUCCEEDED", "REFUNDED"] },
      ...ledgerWhere(args.range),
    },
    select: {
      venueAmount: true,
      paidAt: true,
      refundedAt: true,
      // Event payments share BookingPayment with court bookings. This relation
      // is the durable source marker; no title or amount heuristic is needed.
      eventRegistration: { select: { id: true } },
    },
  });
}

type VenueLedgerDatabaseRow = Awaited<
  ReturnType<typeof venueLedgerRows>
>[number];

function venueLedgerRow(row: VenueLedgerDatabaseRow): LedgerRow {
  return {
    // The advertised court or event amount is what the venue actually keeps.
    // The service fee the player also paid is Bunal.club's, and showing it
    // here would flatter every venue's numbers by the service-fee rate.
    amount: Number(row.venueAmount),
    paidAt: row.paidAt,
    refundedAt: row.refundedAt,
    // A refund reverses the gross, so the venue's share of it is what comes
    // back off their line.
    refundedAmount: row.refundedAt ? Number(row.venueAmount) : null,
  };
}

export type VenueRevenueBreakdown = {
  all: RevenueSeries;
  court: RevenueSeries;
  event: RevenueSeries;
};

// Scoped to one partner, whose id the caller has already proved. `hubId`
// narrows to a single venue for a partner who owns several.
export async function venueRevenue(args: {
  partnerId: string;
  hubId?: string;
  range: RevenueRange;
}): Promise<RevenueSeries> {
  const rows = await venueLedgerRows(args);
  return buildSeries(rows.map(venueLedgerRow), args.range);
}

// One ledger read powers the combined report and both source filters. A
// payment without an event registration is a court payment, including legacy
// rows created before the event relation existed.
export async function venueRevenueBreakdown(
  args: VenueRevenueArgs
): Promise<VenueRevenueBreakdown> {
  const rows = await venueLedgerRows(args);
  const court = rows.filter((row) => row.eventRegistration === null);
  const event = rows.filter((row) => row.eventRegistration !== null);

  return {
    all: buildSeries(rows.map(venueLedgerRow), args.range),
    court: buildSeries(court.map(venueLedgerRow), args.range),
    event: buildSeries(event.map(venueLedgerRow), args.range),
  };
}

// --- Every venue, for the admin ---------------------------------------------

export type MarketplaceSeries = RevenueSeries & {
  // Bunal.club's own take out of that gross — the number the business actually
  // runs on, and the only part of a court payment we ever see.
  serviceFees: number;
  // What the venues kept.
  venueShare: number;
};

export async function marketplaceRevenue(
  range: RevenueRange
): Promise<MarketplaceSeries> {
  await requireAdmin();

  const [rows, settlementCosts] = await Promise.all([
    prisma.bookingPayment.findMany({
      where: {
        status: { in: ["SUCCEEDED", "REFUNDED"] },
        ...ledgerWhere(range),
      },
      select: {
        amount: true,
        venueAmount: true,
        platformFee: true,
        processingFee: true,
        processingFeeResponsibility: true,
        paidAt: true,
        refundedAt: true,
        refundedAmount: true,
      },
    }),
    prisma.serviceFeeSettlement.aggregate({
      where: {
        status: "PAID",
        provider: "paymongo",
        reviewedAt: windowOf(range),
      },
      _sum: { processingFee: true },
    }),
  ]);

  const series = buildSeries(
    rows.map((r) => ({
      amount: Number(r.amount),
      paidAt: r.paidAt,
      refundedAt: r.refundedAt,
      // Marketplace gross excludes PayMongo's processing fee. Reverse only
      // the venue share here so the non-refundable service fee remains net
      // platform revenue, including when a refund originated in PayMongo.
      refundedAmount: r.refundedAt ? Number(r.venueAmount) : null,
    })),
    range
  );

  const paid = rows.filter((r) => r.paidAt);
  const keptByVenues = paid.filter((r) => !r.refundedAt);
  return {
    ...series,
    serviceFees:
      paid.reduce(
        (sum, r) =>
          sum +
          Number(r.platformFee) -
          (r.processingFeeResponsibility === "BUNAL"
            ? Number(r.processingFee)
            : 0),
        0
      ) - Number(settlementCosts._sum.processingFee ?? 0),
    venueShare: keptByVenues.reduce(
      (sum, r) => sum + Number(r.venueAmount),
      0
    ),
  };
}

// --- Ranges -----------------------------------------------------------------

// A whole calendar month in Manila, e.g. ("2026", "07") -> 1st to 31st.
export function monthRange(year: number, month: number): RevenueRange {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: first,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    grain: "day",
  };
}

// A rolling window of whole months ending with `year`-`month`, for the month
// grain.
export function monthsRange(
  year: number,
  month: number,
  months: number
): RevenueRange {
  const end = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(Date.UTC(year, month - months, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: iso(start),
    to: `${iso(end).slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
    grain: "month",
  };
}
