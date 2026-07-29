import "server-only";

import {
  Prisma,
  type PaymentStatus,
  type SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import {
  accessEndsAt,
  applySuccessfulPayment,
  createPaymentRow,
  isEntitled,
  recordChargeResult,
} from "@/lib/billing";
import { getPaymentProvider } from "@/lib/payments";
import { addMonthsTo } from "@/lib/time";

// Collecting from partners, from the admin's side.
//
// Everything here goes through the SAME ledger and the same state machine the
// partner's own billing page uses — createPaymentRow, applySuccessfulPayment.
// An admin taking a payment and a partner pressing "Pay now" must be able to
// happen at the same moment without producing two charges, and the reuse rule
// inside createPaymentRow is what guarantees that.

export type PartnerSubscriptionRow = {
  userId: string;
  name: string | null;
  email: string;
  planName: string;
  planKey: string;
  priceMonthly: number;
  status: SubscriptionStatus;
  method: string;
  // What the entitlement predicate says right now — not the stored column,
  // which may be a transition behind.
  entitled: boolean;
  // When access actually runs out: trial end, period end, or grace end.
  accessEndsAt: Date | null;
  currentPeriodEnd: Date;
  // Set when the partner owes for a period. Null while they're paid up.
  amountDue: number | null;
  courtCount: number;
  hubCount: number;
  lastPayment: {
    amount: number;
    status: PaymentStatus;
    kind: string;
    createdAt: Date;
    ref: string | null;
  } | null;
  // An in-flight checkout for the current period, if one was already started.
  openCheckoutUrl: string | null;
};

export type SubscriptionSummary = {
  partners: number;
  active: number;
  trialing: number;
  pastDue: number;
  unpaid: number;
  // Monthly recurring revenue from partners who are actually entitled — the
  // honest number, not the sum of every row ever created.
  mrr: number;
};

export async function listPartnerSubscriptions(): Promise<{
  rows: PartnerSubscriptionRow[];
  summary: SubscriptionSummary;
}> {
  await requireAdmin();

  const subs = await prisma.subscription.findMany({
    include: {
      plan: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          _count: { select: { hubs: true } },
          hubs: { select: { _count: { select: { courts: true } } } },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          amount: true,
          status: true,
          kind: true,
          createdAt: true,
          providerRef: true,
          redirectUrl: true,
          periodEnd: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  const rows: PartnerSubscriptionRow[] = subs.map((sub) => {
    const entitled = isEntitled(sub);
    const last = sub.payments[0] ?? null;

    // Owed once the paid-for period has run out — which is exactly when the
    // machine has moved them to PAST_DUE or UNPAID, or when a trial has ended.
    const owes =
      sub.status === "PAST_DUE" ||
      sub.status === "UNPAID" ||
      (sub.status === "TRIALING" &&
        !!sub.trialEndsAt &&
        now >= sub.trialEndsAt);

    return {
      userId: sub.userId,
      name: sub.user.name,
      email: sub.user.email,
      planName: sub.plan.name,
      planKey: sub.plan.key,
      priceMonthly: sub.plan.priceMonthly.toNumber(),
      status: sub.status,
      method: sub.method,
      entitled,
      accessEndsAt: accessEndsAt(sub),
      currentPeriodEnd: sub.currentPeriodEnd,
      amountDue: owes ? sub.plan.priceMonthly.toNumber() : null,
      courtCount: sub.user.hubs.reduce((n, h) => n + h._count.courts, 0),
      hubCount: sub.user._count.hubs,
      lastPayment: last
        ? {
            amount: last.amount.toNumber(),
            status: last.status,
            kind: last.kind,
            createdAt: last.createdAt,
            ref: last.providerRef,
          }
        : null,
      openCheckoutUrl:
        last && last.status === "PENDING" ? last.redirectUrl : null,
    };
  });

  const summary: SubscriptionSummary = {
    partners: rows.length,
    active: rows.filter((r) => r.status === "ACTIVE").length,
    trialing: rows.filter((r) => r.status === "TRIALING").length,
    pastDue: rows.filter((r) => r.status === "PAST_DUE").length,
    unpaid: rows.filter((r) => r.status === "UNPAID").length,
    mrr: rows
      .filter((r) => r.entitled && r.status === "ACTIVE")
      .reduce((sum, r) => sum + r.priceMonthly, 0),
  };

  return { rows, summary };
}

const subInclude = { plan: true } as const;

async function loadSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: subInclude,
  });
  if (!sub) throw new Error("That partner has no subscription.");
  return sub;
}

// The period a CHECKOUT should cover. Paying ahead extends from the current
// end; paying late starts now — the same rule payNowAction uses, so an admin
// and a partner pressing pay at the same moment agree on the period, and
// createPaymentRow's reuse rule can recognise it as one payment.
function periodFor(sub: {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
}) {
  const now = new Date();
  const periodStart =
    sub.status === "ACTIVE" && sub.currentPeriodEnd > now
      ? sub.currentPeriodEnd
      : now;
  return { periodStart, periodEnd: addMonthsTo(periodStart, 1) };
}

// The period a LEDGER ENTRY should cover — recording cash, or comping. This
// deliberately does NOT roll forward.
//
// Rolling forward is right for a checkout, where every press is someone
// choosing to pay again. It is dangerous here: an admin double-clicking "Record
// received" would credit two months for one bank transfer, and there is no
// gateway record to reconcile against. So a partner who is already covered
// gets a refusal, and the entry always continues from where their access
// actually runs out — nobody loses the days they already paid for.
function duePeriodFor(sub: {
  currentPeriodEnd: Date;
}): { periodStart: Date; periodEnd: Date } | null {
  const now = new Date();
  if (sub.currentPeriodEnd > now) return null;
  return {
    periodStart: sub.currentPeriodEnd,
    periodEnd: addMonthsTo(sub.currentPeriodEnd, 1),
  };
}

export type AdminCollectResult =
  | { ok: true; checkoutUrl: string; reused: boolean }
  | { ok: false; message: string };

// Creates (or re-hands-back) a checkout the admin can send to the partner.
export async function createAdminPaymentLink(
  userId: string,
): Promise<AdminCollectResult> {
  await requireAdmin();
  const sub = await loadSubscription(userId);
  const { periodStart, periodEnd } = periodFor(sub);

  const payment = await createPaymentRow({
    sub,
    periodStart,
    periodEnd,
    kind: "MANUAL",
  });

  // Someone already started this period's payment — the partner from their own
  // billing page, or an admin a minute ago. Hand back the same checkout rather
  // than opening a second one against the same period.
  if (payment.reused && payment.row.redirectUrl) {
    return { ok: true, checkoutUrl: payment.row.redirectUrl, reused: true };
  }

  const provider = getPaymentProvider();
  const result = await provider.charge({
    customerId: sub.providerCustomerId,
    amount: { amount: sub.plan.priceMonthly.toNumber(), currency: "PHP" },
    // No saved card is possible with a hosted gateway; the payer picks on the
    // gateway's page. The method here is only a hint for the stub.
    source: { kind: "new", method: { type: "GCASH" } },
    description: `${sub.plan.name} — monthly subscription`,
    idempotencyKey: payment.row.idempotencyKey,
    returnUrl: "/dashboard/billing",
    metadata: { subscriptionId: sub.id, userId },
  });

  await recordChargeResult(payment.row.id, result);

  if (result.status === "requires_action") {
    return { ok: true, checkoutUrl: result.redirectUrl, reused: false };
  }
  if (result.status === "succeeded") {
    // Nothing to send — it's already paid.
    await applySuccessfulPayment(payment.row.id);
    return { ok: false, message: "That payment went through immediately." };
  }
  return {
    ok: false,
    message:
      result.status === "failed"
        ? result.message
        : "The gateway is still processing that payment.",
  };
}

export type AdminLedgerResult =
  { ok: true; message: string } | { ok: false; message: string };

// Money that arrived outside the app — a bank transfer, cash, or GCash to a
// number. Recorded so the partner's own history shows it and the state machine
// treats them as paid.
export async function recordOfflinePayment(args: {
  userId: string;
  note?: string;
}): Promise<AdminLedgerResult> {
  const admin = await requireAdmin();
  const sub = await loadSubscription(args.userId);
  const due = duePeriodFor(sub);
  if (!due) {
    return {
      ok: false,
      message: `Nothing is due — they're paid up to ${sub.currentPeriodEnd.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}.`,
    };
  }
  const { periodStart, periodEnd } = due;

  // The unique idempotencyKey below is the real guard: two admins recording
  // the same transfer at once produce one row, not two months of credit.
  let payment;
  try {
    payment = await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        userId: args.userId,
        planId: sub.planId,
        kind: "MANUAL",
        amount: sub.plan.priceMonthly,
        method: sub.method,
        status: "SUCCEEDED",
        periodStart,
        periodEnd,
        paidAt: new Date(),
        // No gateway was involved, so the trail is who recorded it.
        providerRef: `offline:${admin.email}`,
        failureMessage: args.note?.slice(0, 500) ?? null,
        idempotencyKey: `offline:${sub.id}:${periodEnd.toISOString()}`,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "That period was already recorded." };
    }
    throw error;
  }

  await applySuccessfulPayment(payment.id);
  return { ok: true, message: "Recorded, and their hubs are live again." };
}

// A period given away: same ledger row, zero pesos. The PaymentKind enum has
// carried COMP for exactly this since the subscription work.
export async function compPeriod(args: {
  userId: string;
  note?: string;
}): Promise<AdminLedgerResult> {
  const admin = await requireAdmin();
  const sub = await loadSubscription(args.userId);
  const due = duePeriodFor(sub);
  if (!due) {
    return {
      ok: false,
      message: `Nothing is due — they're covered to ${sub.currentPeriodEnd.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}.`,
    };
  }
  const { periodStart, periodEnd } = due;

  let payment;
  try {
    payment = await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        userId: args.userId,
        planId: sub.planId,
        kind: "COMP",
        amount: new Prisma.Decimal(0),
        method: sub.method,
        status: "SUCCEEDED",
        periodStart,
        periodEnd,
        paidAt: new Date(),
        providerRef: `comp:${admin.email}`,
        failureMessage: args.note?.slice(0, 500) ?? null,
        idempotencyKey: `comp:${sub.id}:${periodEnd.toISOString()}`,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "That period was already comped." };
    }
    throw error;
  }

  await applySuccessfulPayment(payment.id);
  return { ok: true, message: "Comped for a month." };
}
