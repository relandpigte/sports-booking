import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type {
  PaymentKind,
  PaymentMethodType,
  PaymentStatus,
  PlanKey,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/dal";
import { getPaymentProvider, type ChargeResult } from "@/lib/payments";
import { addDaysTo, addMonthsTo } from "@/lib/time";
import {
  GRACE_DAYS,
  MAX_RENEWAL_ATTEMPTS,
  RENEWAL_RETRY_DAYS,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Views (Prisma.Decimal is not RSC-serializable — every conversion happens in
// this file, exactly like mapCourt/mapBooking elsewhere. Nothing outside
// billing.ts ever holds a Decimal.)
// ---------------------------------------------------------------------------

export type PlanView = {
  id: string;
  key: PlanKey;
  name: string;
  blurb: string | null;
  priceMonthly: number;
  currency: string;
  maxCourts: number | null;
  sortOrder: number;
};

export type SubscriptionView = {
  id: string;
  status: SubscriptionStatus;
  method: PaymentMethodType;
  autoRenew: boolean;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  renewalAttempts: number;
};

export type PaymentView = {
  id: string;
  kind: PaymentKind;
  amount: number;
  method: PaymentMethodType;
  status: PaymentStatus;
  periodStart: Date;
  periodEnd: Date;
  providerRef: string | null;
  failureMessage: string | null;
  redirectUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export type SavedCardView = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

function mapPlan(row: {
  id: string;
  key: PlanKey;
  name: string;
  blurb: string | null;
  priceMonthly: Prisma.Decimal;
  currency: string;
  maxCourts: number | null;
  sortOrder: number;
}): PlanView {
  return { ...row, priceMonthly: row.priceMonthly.toNumber() };
}

function mapPayment(row: {
  id: string;
  kind: PaymentKind;
  amount: Prisma.Decimal;
  method: PaymentMethodType;
  status: PaymentStatus;
  periodStart: Date;
  periodEnd: Date;
  providerRef: string | null;
  failureMessage: string | null;
  redirectUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
}): PaymentView {
  return { ...row, amount: row.amount.toNumber() };
}

// ---------------------------------------------------------------------------
// Entitlement — the single predicate the whole feature hangs off.
//
// It is derived purely from the row and the clock, so it is correct with ZERO
// writes and no scheduler: a partner who never signs in again stops being
// listed the instant their grace expires.
// ---------------------------------------------------------------------------

type EntitlementFields = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd?: boolean;
};

// TRIALING and ACTIVE include the grace window the state machine WOULD grant
// when the deadline passes (see the PAST_DUE transitions). Without that, a
// partner would be unlisted the instant their trial ended and only regain
// access once the transition happened to run — making entitlement depend on a
// background job, which is exactly what this predicate exists to avoid.
//
// A subscription set to cancel gets no grace: cancelling means it simply ends.
function graceCutoff(deadline: Date): Date {
  return addDaysTo(deadline, GRACE_DAYS);
}

export function isEntitled(
  sub: EntitlementFields | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false;
  switch (sub.status) {
    case "TRIALING":
      if (sub.trialEndsAt == null) return false;
      return sub.cancelAtPeriodEnd
        ? sub.trialEndsAt > now
        : graceCutoff(sub.trialEndsAt) > now;
    case "ACTIVE":
      return sub.cancelAtPeriodEnd
        ? sub.currentPeriodEnd > now
        : graceCutoff(sub.currentPeriodEnd) > now;
    case "PAST_DUE":
      // Recorded explicitly once the machine has run.
      return sub.graceEndsAt != null && sub.graceEndsAt > now;
    default:
      // UNPAID, CANCELLED
      return false;
  }
}

// The same predicate as a Prisma filter, for the public hub listing.
// `deadline + GRACE > now` is expressed as `deadline > now - GRACE`.
export function entitledSubscriptionWhere(
  now: Date
): Prisma.SubscriptionWhereInput {
  const graceFloor = addDaysTo(now, -GRACE_DAYS);
  return {
    OR: [
      {
        status: "TRIALING",
        cancelAtPeriodEnd: false,
        trialEndsAt: { gt: graceFloor },
      },
      { status: "TRIALING", cancelAtPeriodEnd: true, trialEndsAt: { gt: now } },
      {
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { gt: graceFloor },
      },
      {
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { gt: now },
      },
      { status: "PAST_DUE", graceEndsAt: { gt: now } },
    ],
  };
}

// The next date that matters to the partner: when the trial or paid period
// ends, or when a lapsed subscription finally loses access.
export function accessEndsAt(sub: EntitlementFields | null): Date | null {
  if (!sub) return null;
  switch (sub.status) {
    case "TRIALING":
      return sub.trialEndsAt;
    case "ACTIVE":
      return sub.currentPeriodEnd;
    case "PAST_DUE":
      return sub.graceEndsAt;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const planSelect = {
  id: true,
  key: true,
  name: true,
  blurb: true,
  priceMonthly: true,
  currency: true,
  maxCourts: true,
  sortOrder: true,
} as const;

export const listPlans = cache(async (): Promise<PlanView[]> => {
  const rows = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: planSelect,
  });
  return rows.map(mapPlan);
});

// The one plan there is. Joining is free, so a Plan row exists only to keep
// Subscription.planId and Payment.planId valid — and so historical payments
// still point at the tier that was actually bought.
export async function freePlan(): Promise<PlanView | null> {
  const row = await prisma.plan.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: planSelect,
  });
  return row ? mapPlan(row) : null;
}

export async function getPlanByKey(key: PlanKey): Promise<PlanView | null> {
  const row = await prisma.plan.findUnique({
    where: { key },
    select: planSelect,
  });
  return row ? mapPlan(row) : null;
}

// Total courts across ALL of a partner's hubs — the number every tier caps.
export async function countPartnerCourts(userId: string): Promise<number> {
  return prisma.court.count({ where: { hub: { ownerId: userId } } });
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

const subInclude = { plan: true } as const;
type SubRow = Prisma.SubscriptionGetPayload<{ include: typeof subInclude }>;

// Every transition is version-guarded: two requests crossing the same deadline
// can't both apply it. Returns null when someone else won, so the caller
// re-reads exactly once.
async function transition(
  sub: SubRow,
  data: Prisma.SubscriptionUncheckedUpdateInput
): Promise<SubRow | null> {
  const { count } = await prisma.subscription.updateMany({
    where: { id: sub.id, version: sub.version },
    data: { ...data, version: { increment: 1 }, lastEvaluatedAt: new Date() },
  });
  if (count === 0) return null;
  return prisma.subscription.findUnique({
    where: { id: sub.id },
    include: subInclude,
  });
}

// Charges for one period and applies the outcome.
//
// This is the ONLY place the DAL touches the gateway, and it is a hard no-op
// unless sub.autoRenew — which is the mechanical guarantee that GCash and Maya
// are never silently re-charged.
async function attemptRenewal(
  sub: SubRow,
  opts: { periodStart: Date; now: Date; retry?: boolean }
): Promise<SubRow | null> {
  if (!sub.autoRenew) return sub;

  const periodEnd = addMonthsTo(opts.periodStart, 1);
  const card = await prisma.savedPaymentMethod.findFirst({
    where: { userId: sub.userId, deletedAt: null, isDefault: true },
  });

  // autoRenew without a card is a contradiction; fix the flag and fall through
  // to the manual path rather than pretending we can charge.
  if (!card?.providerMethodId) {
    return transition(sub, {
      autoRenew: false,
      status: "PAST_DUE",
      graceEndsAt: addDaysTo(opts.periodStart, GRACE_DAYS),
    });
  }

  const payment = await createPaymentRow({
    sub,
    periodStart: opts.periodStart,
    periodEnd,
    kind: "SUBSCRIPTION",
    amount: await accruedFees(sub.userId, opts.periodStart, periodEnd),
    savedPaymentMethodId: card.id,
  });

  // A concurrent request already created (and is charging) this exact period.
  if (payment.reused) {
    return prisma.subscription.findUnique({
      where: { id: sub.id },
      include: subInclude,
    });
  }

  const provider = getPaymentProvider();
  const result = await provider.charge({
    customerId: sub.providerCustomerId,
    amount: { amount: Number(payment.row.amount), currency: "PHP" },
    source: { kind: "saved", methodId: card.providerMethodId },
    description: `${sub.plan.name} — monthly subscription`,
    idempotencyKey: payment.row.idempotencyKey,
    returnUrl: `/dashboard/billing/checkout/${payment.row.id}`,
    metadata: { subscriptionId: sub.id, userId: sub.userId },
  });

  await recordChargeResult(payment.row.id, result);

  if (result.status === "succeeded") {
    return transition(sub, {
      status: "ACTIVE",
      currentPeriodStart: opts.periodStart,
      currentPeriodEnd: periodEnd,
      trialEndsAt: null,
      graceEndsAt: null,
      renewalAttempts: 0,
      nextRetryAt: null,
    });
  }

  // requires_action / pending / failed all leave the partner owing money.
  const attempts = sub.renewalAttempts + 1;
  return transition(sub, {
    status: "PAST_DUE",
    graceEndsAt: sub.graceEndsAt ?? addDaysTo(opts.periodStart, GRACE_DAYS),
    renewalAttempts: attempts,
    nextRetryAt:
      attempts < MAX_RENEWAL_ATTEMPTS
        ? addDaysTo(opts.now, RENEWAL_RETRY_DAYS)
        : null,
  });
}

// What a partner owes us for a period: the service fees their own gateway
// collected from players on our behalf.
//
// Joining is free, so this REPLACES the flat plan price as the amount of every
// invoice. Refunded payments are excluded — the fee went back to the player
// with the rest of it, so there is nothing to bill for.
export async function accruedFees(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const result = await prisma.bookingPayment.aggregate({
    where: {
      partnerId: userId,
      status: "SUCCEEDED",
      // By the day the money MOVED, which is the only date a venue can
      // reconcile against their own bank statement.
      paidAt: { gte: periodStart, lt: periodEnd },
    },
    _sum: { platformFee: true },
  });
  return Number(result._sum.platformFee ?? 0);
}

// Creates the PENDING ledger row BEFORE any money moves, so a crash mid-charge
// leaves a row the sweep can reconcile via getCharge rather than a silent hole.
//
// The unique idempotencyKey is the double-charge guard: two requests crossing
// the same deadline compute the same key, and the loser reads the winner's row
// instead of charging again. Same idea as BookingSlot's unique index.
export async function createPaymentRow(args: {
  sub: SubRow;
  periodStart: Date;
  periodEnd: Date;
  kind: PaymentKind;
  // The invoice total. Passed in rather than read from the plan, because it is
  // now the accrued service fees for the period — see accruedFees.
  amount: number;
  savedPaymentMethodId?: string | null;
  method?: PaymentMethodType;
}): Promise<{
  row: Prisma.PaymentGetPayload<Record<string, never>>;
  reused: boolean;
}> {
  const { sub, periodStart, periodEnd, kind } = args;

  // Reuse an in-flight payment for the same period rather than making a second.
  const pending = await prisma.payment.findFirst({
    where: { subscriptionId: sub.id, periodEnd, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (pending) return { row: pending, reused: true };

  const attempt = await prisma.payment.count({
    where: { subscriptionId: sub.id, periodEnd },
  });
  const idempotencyKey = `${sub.id}:${periodEnd.toISOString()}:${attempt}`;

  try {
    const row = await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        userId: sub.userId,
        planId: sub.planId,
        kind,
        amount: new Prisma.Decimal(args.amount),
        method: args.method ?? sub.method,
        status: "PENDING",
        periodStart,
        periodEnd,
        idempotencyKey,
        savedPaymentMethodId: args.savedPaymentMethodId ?? null,
      },
    });
    return { row, reused: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Someone else won the race — adopt their row.
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return { row: existing, reused: true };
    }
    throw error;
  }
}

// Writes a gateway outcome onto the ledger row. Never touches the subscription
// — the caller decides what the outcome means for access.
export async function recordChargeResult(
  paymentId: string,
  result: ChargeResult
): Promise<void> {
  const common = { raw: result.raw as Prisma.InputJsonValue };

  if (result.status === "succeeded") {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "SUCCEEDED",
        providerPaymentId: result.paymentId,
        providerRef: result.reference,
        paidAt: new Date(),
        ...common,
      },
    });
    return;
  }
  if (result.status === "requires_action") {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "PENDING",
        providerPaymentId: result.paymentId,
        providerClientKey: result.clientKey,
        redirectUrl: result.redirectUrl,
        ...common,
      },
    });
    return;
  }
  if (result.status === "pending") {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "PENDING",
        providerPaymentId: result.paymentId,
        providerRef: result.reference,
        ...common,
      },
    });
    return;
  }
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "FAILED",
      providerPaymentId: result.paymentId,
      failureCode: result.code,
      failureMessage: result.message,
      ...common,
    },
  });
}

// Applies a SUCCEEDED payment to the subscription. Idempotent: re-running it
// for a period already covered is a no-op, which is what makes webhook replay
// and the browser-return leg both safe.
export async function applySuccessfulPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { subscription: { include: subInclude } },
  });
  if (!payment || payment.status !== "SUCCEEDED") return;

  const sub = payment.subscription;
  if (sub.currentPeriodEnd >= payment.periodEnd && sub.status === "ACTIVE") {
    return; // already applied
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: "ACTIVE",
      currentPeriodStart: payment.periodStart,
      currentPeriodEnd: payment.periodEnd,
      trialEndsAt: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      renewalAttempts: 0,
      nextRetryAt: null,
      version: { increment: 1 },
    },
  });
}

// One pass of the machine. Returns the settled row, or null if another request
// transitioned it first (caller re-reads once).
async function evaluateOnce(sub: SubRow, now: Date): Promise<SubRow | null> {
  // Grace elapsed — access is restricted. Nothing is deleted.
  if (sub.status === "PAST_DUE" && sub.graceEndsAt && now >= sub.graceEndsAt) {
    return transition(sub, { status: "UNPAID" });
  }

  // Cancelled, and the paid-for period has now run out.
  if (
    sub.status === "ACTIVE" &&
    now >= sub.currentPeriodEnd &&
    sub.cancelAtPeriodEnd
  ) {
    return transition(sub, { status: "CANCELLED", cancelledAt: now });
  }

  // A period ended — the trial's or a paid one's. What happens next depends on
  // whether the partner owes anything, and since joining is free, most months
  // they will not.
  //
  // A venue with no bookings owes ₱0, and marking THAT past due would unlist a
  // hub over a bill for nothing. So a zero accrual rolls the period forward and
  // leaves them active. This is the behaviour a flat-plan machine could never
  // have: an invoice that simply isn't raised.
  const endedAt =
    sub.status === "TRIALING" && sub.trialEndsAt && now >= sub.trialEndsAt
      ? sub.trialEndsAt
      : sub.status === "ACTIVE" && now >= sub.currentPeriodEnd
        ? sub.currentPeriodEnd
        : null;

  if (endedAt) {
    const owed = await accruedFees(sub.userId, sub.currentPeriodStart, endedAt);

    if (owed <= 0) {
      return transition(sub, {
        status: "ACTIVE",
        currentPeriodStart: endedAt,
        currentPeriodEnd: addMonthsTo(endedAt, 1),
        trialEndsAt: null,
        graceEndsAt: null,
        renewalAttempts: 0,
        nextRetryAt: null,
      });
    }

    return sub.autoRenew
      ? attemptRenewal(sub, { periodStart: endedAt, now })
      : // Nothing is charged without the partner: they get a link and a week.
        transition(sub, {
          status: "PAST_DUE",
          graceEndsAt: addDaysTo(endedAt, GRACE_DAYS),
        });
  }

  // Card dunning retry, still inside grace.
  if (
    sub.status === "PAST_DUE" &&
    sub.autoRenew &&
    sub.nextRetryAt &&
    now >= sub.nextRetryAt &&
    sub.renewalAttempts < MAX_RENEWAL_ATTEMPTS
  ) {
    return attemptRenewal(sub, {
      periodStart: sub.currentPeriodEnd,
      now,
      retry: true,
    });
  }

  return sub; // nothing due — a pure read
}

export async function evaluateSubscription(
  userId: string
): Promise<SubRow | null> {
  const now = new Date();
  for (let i = 0; i < 2; i++) {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      include: subInclude,
    });
    if (!sub) return null;
    const next = await evaluateOnce(sub, now);
    if (next) return next;
  }
  return prisma.subscription.findUnique({
    where: { userId },
    include: subInclude,
  });
}

// Advances every subscription whose deadline has passed. Exposed as
// POST /api/billing/sweep so a cron can drive it.
//
// This only pulls CHARGES forward. Listing correctness never depends on it —
// the entitlement predicate is time-based.
export async function sweepDueSubscriptions(
  opts: { limit?: number } = {}
): Promise<{ evaluated: number }> {
  const now = new Date();
  const due = await prisma.subscription.findMany({
    where: {
      OR: [
        { status: "TRIALING", trialEndsAt: { lte: now } },
        { status: "ACTIVE", currentPeriodEnd: { lte: now } },
        { status: "PAST_DUE", graceEndsAt: { lte: now } },
        { status: "PAST_DUE", autoRenew: true, nextRetryAt: { lte: now } },
      ],
    },
    select: { userId: true },
    take: opts.limit ?? 50,
  });

  for (const row of due) {
    try {
      await evaluateSubscription(row.userId);
    } catch {
      // One bad subscription must never abort the sweep.
    }
  }
  return { evaluated: due.length };
}

// ---------------------------------------------------------------------------
// Overview for the billing page
// ---------------------------------------------------------------------------

export type BillingOverview = {
  subscription: SubscriptionView;
  plan: PlanView;
  plans: PlanView[];
  entitled: boolean;
  accessEndsAt: Date | null;
  // Whole days until access lapses, or null when nothing is pending. Computed
  // here rather than at render so components stay pure.
  daysUntilAccessEnds: number | null;
  amountDue: number | null;
  courtCount: number;
  savedCard: SavedCardView | null;
  payments: PaymentView[];
  pendingPayment: { id: string; redirectUrl: string | null } | null;
};

const paymentSelect = {
  id: true,
  kind: true,
  amount: true,
  method: true,
  status: true,
  periodStart: true,
  periodEnd: true,
  providerRef: true,
  failureMessage: true,
  redirectUrl: true,
  paidAt: true,
  createdAt: true,
} as const;

export async function getBillingOverview(): Promise<BillingOverview | null> {
  const partner = await requirePartner();
  const sub = await evaluateSubscription(partner.id);
  if (!sub) return null;

  const [plans, courtCount, card, payments] = await Promise.all([
    listPlans(),
    countPartnerCourts(partner.id),
    prisma.savedPaymentMethod.findFirst({
      where: { userId: partner.id, deletedAt: null, isDefault: true },
      select: {
        id: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
      },
    }),
    prisma.payment.findMany({
      where: { userId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: paymentSelect,
    }),
  ]);

  const entitled = isEntitled(sub);
  const owes =
    sub.status === "PAST_DUE" ||
    sub.status === "UNPAID" ||
    sub.status === "CANCELLED";

  const pending = payments.find((p) => p.status === "PENDING") ?? null;
  const endsAt = accessEndsAt(sub);
  const daysUntilAccessEnds = endsAt
    ? Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      method: sub.method,
      autoRenew: sub.autoRenew,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      graceEndsAt: sub.graceEndsAt,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      renewalAttempts: sub.renewalAttempts,
    },
    plan: mapPlan(sub.plan),
    plans,
    entitled,
    accessEndsAt: endsAt,
    daysUntilAccessEnds,
    amountDue: owes ? sub.plan.priceMonthly.toNumber() : null,
    courtCount,
    savedCard: card,
    payments: payments.map(mapPayment),
    pendingPayment: pending
      ? { id: pending.id, redirectUrl: pending.redirectUrl }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

// Page gate. Sends a lapsed partner to the billing page rather than /login —
// they're signed in, they just can't do this until they pay.
export async function requireEntitledPartner() {
  const partner = await requirePartner();
  const sub = await evaluateSubscription(partner.id);
  if (!isEntitled(sub)) {
    redirect("/dashboard/billing");
  }
  return { partner, subscription: sub!, plan: mapPlan(sub!.plan) };
}

// Action gate. NEVER redirects — a Server Action should return a message the
// form can render, not throw the user somewhere.
export async function partnerBillingGate(): Promise<
  | {
      ok: true;
      partner: Awaited<ReturnType<typeof requirePartner>>;
      plan: PlanView;
    }
  | { ok: false; message: string }
> {
  const partner = await requirePartner();
  const sub = await evaluateSubscription(partner.id);
  if (!isEntitled(sub)) {
    return {
      ok: false,
      message:
        "Your subscription isn't active. Visit Billing to pay and re-enable your hubs.",
    };
  }
  return { ok: true, partner, plan: mapPlan(sub!.plan) };
}

// Tiers cap the TOTAL courts across all of a partner's hubs.
export async function checkCourtLimit(args: {
  userId: string;
  plan: PlanView;
  excludeHubId?: string;
  adding: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { userId, plan, excludeHubId, adding } = args;
  if (plan.maxCourts == null) return { ok: true }; // unlimited

  const others = await prisma.court.count({
    where: {
      hub: {
        ownerId: userId,
        ...(excludeHubId ? { id: { not: excludeHubId } } : {}),
      },
    },
  });
  const total = others + adding;
  if (total <= plan.maxCourts) return { ok: true };

  return {
    ok: false,
    message: `${plan.name} includes up to ${plan.maxCourts} courts and this would make ${total}. Upgrade your plan or remove a court.`,
  };
}
