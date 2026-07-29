import "server-only";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { addDays, manilaDateOf, manilaInstant, manilaMonthOf } from "@/lib/time";

// Revenue over time, for whoever is allowed to see it.
//
// One shape, three sources — so the report component never learns where its
// numbers came from, and the same panel serves a partner looking at their court
// takings and an admin looking at platform income.
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

// Scoped to one partner, whose id the caller has already proved. `hubId`
// narrows to a single venue for a partner who owns several.
export async function venueRevenue(args: {
  partnerId: string;
  hubId?: string;
  range: RevenueRange;
}): Promise<RevenueSeries> {
  const rows = await prisma.bookingPayment.findMany({
    where: {
      partnerId: args.partnerId,
      ...(args.hubId ? { hubId: args.hubId } : {}),
      // SUCCEEDED or REFUNDED: a refunded payment still had a sale to reverse.
      status: { in: ["SUCCEEDED", "REFUNDED"] },
      ...ledgerWhere(args.range),
    },
    select: {
      amount: true,
      paidAt: true,
      refundedAt: true,
      refundedAmount: true,
    },
  });

  return buildSeries(
    rows.map((r) => ({
      amount: Number(r.amount),
      paidAt: r.paidAt,
      refundedAt: r.refundedAt,
      refundedAmount: r.refundedAmount != null ? Number(r.refundedAmount) : null,
    })),
    args.range
  );
}

// --- Partners paying Bunal.ph -----------------------------------------------

export type PlatformRevenueSeries = RevenueSeries & {
  // Comped periods are ₱0 by construction, so they can't inflate revenue — but
  // a month given away is still an event worth seeing.
  comped: number;
};

export async function platformRevenue(
  range: RevenueRange
): Promise<PlatformRevenueSeries> {
  await requireAdmin();

  const rows = await prisma.payment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "REFUNDED"] },
      ...ledgerWhere(range),
    },
    select: {
      kind: true,
      amount: true,
      paidAt: true,
      refundedAt: true,
      refundedAmount: true,
    },
  });

  const series = buildSeries(
    rows.map((r) => ({
      amount: Number(r.amount),
      paidAt: r.paidAt,
      refundedAt: r.refundedAt,
      refundedAmount: r.refundedAmount != null ? Number(r.refundedAmount) : null,
    })),
    range
  );

  return { ...series, comped: rows.filter((r) => r.kind === "COMP").length };
}

// --- Every venue, for the admin ---------------------------------------------

export async function marketplaceRevenue(
  range: RevenueRange
): Promise<RevenueSeries> {
  await requireAdmin();

  const rows = await prisma.bookingPayment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "REFUNDED"] },
      ...ledgerWhere(range),
    },
    select: {
      amount: true,
      paidAt: true,
      refundedAt: true,
      refundedAmount: true,
    },
  });

  return buildSeries(
    rows.map((r) => ({
      amount: Number(r.amount),
      paidAt: r.paidAt,
      refundedAt: r.refundedAt,
      refundedAmount: r.refundedAmount != null ? Number(r.refundedAmount) : null,
    })),
    range
  );
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
