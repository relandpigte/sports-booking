"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethodType, PlanKey } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import { getPaymentProvider } from "@/lib/payments";
import { addMonthsTo } from "@/lib/time";
import {
  accruedFees,
  applySuccessfulPayment,
  countPartnerCourts,
  createPaymentRow,
  evaluateSubscription,
  getPlanByKey,
  recordChargeResult,
} from "@/lib/billing";
import {
  CardSchema,
  ChangePlanSchema,
  SetPaymentMethodSchema,
} from "@/lib/validation";

export type BillingFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  // E-wallet checkout — the client pushes to it.
  redirectUrl?: string;
};

function revalidateBilling(hubOwnerId?: string) {
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/hubs");
  // Cheap insurance: the public directory filters on entitlement.
  revalidatePath("/hubs");
  if (hubOwnerId) revalidatePath(`/hubs`);
}

// Loads the signed-in partner's subscription. No action ever accepts a
// subscription id from the form — ownership is the where clause.
async function loadOwnSubscription() {
  const partner = await requirePartner();
  const sub = await evaluateSubscription(partner.id);
  return { partner, sub };
}

// Charges the amount owed now. Used for a lapsed subscription and for e-wallets,
// which are never charged automatically.
export async function payNowAction(
  _prev: BillingFormState,
  _formData: FormData
): Promise<BillingFormState> {
  const { partner, sub } = await loadOwnSubscription();
  if (!sub) return { message: "No subscription found." };

  const now = new Date();
  const periodStart =
    sub.status === "ACTIVE" && sub.currentPeriodEnd > now
      ? sub.currentPeriodEnd // paying ahead extends from the current end
      : now;
  const periodEnd = addMonthsTo(periodStart, 1);

  const card =
    sub.method === "CARD"
      ? await prisma.savedPaymentMethod.findFirst({
          where: { userId: partner.id, deletedAt: null, isDefault: true },
        })
      : null;

  // What they owe is what they collected for us during the period that just
  // ended — not the period this payment buys, which has no fees in it yet.
  const owed = await accruedFees(
    partner.id,
    sub.currentPeriodStart,
    sub.currentPeriodEnd
  );
  if (owed <= 0) {
    return { message: "Nothing is due — no service fees have accrued yet." };
  }

  const payment = await createPaymentRow({
    sub,
    periodStart,
    periodEnd,
    kind: "MANUAL",
    amount: owed,
    savedPaymentMethodId: card?.id ?? null,
  });

  const provider = getPaymentProvider();

  // Where the payer actually has to go. A hosted gateway hands us its own URL
  // and we send them there; the stub's checkout is a page in this app.
  const checkoutFor = (row: { id: string; redirectUrl: string | null }) =>
    provider.checkout === "hosted"
      ? row.redirectUrl
      : `/dashboard/billing/checkout/${row.id}`;

  // An in-flight payment for this period already exists — hand back its
  // checkout rather than creating a second one.
  if (payment.reused && payment.row.status === "PENDING") {
    const url = checkoutFor(payment.row);
    return url
      ? { redirectUrl: url }
      : { message: "A payment is already being processed. Refresh in a moment." };
  }

  const result = await provider.charge({
    customerId: sub.providerCustomerId,
    amount: { amount: Number(payment.row.amount), currency: "PHP" },
    source:
      card?.providerMethodId != null
        ? { kind: "saved", methodId: card.providerMethodId }
        : { kind: "new", method: { type: sub.method as "GCASH" | "MAYA" } },
    description: `Bunal.ph service fees — ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
    idempotencyKey: payment.row.idempotencyKey,
    // A hosted gateway sends the browser back here after the payment; the
    // provider makes this absolute, since the trip leaves the site.
    returnUrl: `/dashboard/billing`,
    metadata: { subscriptionId: sub.id, userId: partner.id },
  });

  await recordChargeResult(payment.row.id, result);

  if (result.status === "succeeded") {
    await applySuccessfulPayment(payment.row.id);
    revalidateBilling();
    return { success: "Payment received. Your subscription is active." };
  }

  if (result.status === "requires_action") {
    revalidateBilling();
    const url =
      provider.checkout === "hosted"
        ? result.redirectUrl
        : `/dashboard/billing/checkout/${payment.row.id}`;
    return { redirectUrl: url };
  }

  if (result.status === "failed") {
    revalidateBilling();
    return { message: result.message };
  }

  revalidateBilling();
  return { message: "Payment is processing. We'll update this shortly." };
}

// Plan changes take effect immediately (the court limit applies now); the new
// price applies from the next charge. No proration.
export async function changePlanAction(
  _prev: BillingFormState,
  formData: FormData
): Promise<BillingFormState> {
  const { partner, sub } = await loadOwnSubscription();
  if (!sub) return { message: "No subscription found." };

  const parsed = ChangePlanSchema.safeParse({
    planKey: String(formData.get("planKey") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const target = await getPlanByKey(parsed.data.planKey as PlanKey);
  if (!target) return { message: "That plan is unavailable." };
  if (target.id === sub.planId) {
    return { message: "You're already on that plan." };
  }

  // Downgrading below the current court count is BLOCKED rather than allowed
  // and frozen: freezing would mean paying less while serving more courts, and
  // "freezing" a court has no coherent meaning — any automatic choice of which
  // courts stop being bookable would break players' confirmed reservations.
  const courts = await countPartnerCourts(partner.id);
  if (target.maxCourts != null && courts > target.maxCourts) {
    return {
      message: `${target.name} includes up to ${target.maxCourts} courts, and you currently have ${courts}. Remove ${courts - target.maxCourts} court${courts - target.maxCourts === 1 ? "" : "s"} first.`,
    };
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { planId: target.id, version: { increment: 1 } },
  });

  revalidateBilling();
  return {
    success: `Switched to ${target.name}. The new rate applies from your next payment.`,
  };
}

// Changes how the partner pays. Switching to an e-wallet turns auto-renew OFF —
// e-wallets are never charged without the partner approving each payment.
export async function setPaymentMethodAction(
  _prev: BillingFormState,
  formData: FormData
): Promise<BillingFormState> {
  const { partner, sub } = await loadOwnSubscription();
  if (!sub) return { message: "No subscription found." };

  const parsed = SetPaymentMethodSchema.safeParse({
    method: String(formData.get("method") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const method = parsed.data.method as PaymentMethodType;

  if (method !== "CARD") {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { method, autoRenew: false, version: { increment: 1 } },
    });
    revalidateBilling();
    return {
      success: `Switched to ${method === "GCASH" ? "GCash" : "Maya"}. We'll remind you to pay each month — we never charge an e-wallet automatically.`,
    };
  }

  const provider = getPaymentProvider();

  // A hosted gateway can't store a card, and the form that used to collect one
  // isn't rendered. Refused here too: a Server Action is a public endpoint, and
  // letting it through would reach createPaymentMethod, which throws.
  if (provider.checkout === "hosted") {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { method: "CARD", autoRenew: false, version: { increment: 1 } },
    });
    revalidateBilling();
    return {
      success:
        "Switched to card. We'll send you a secure PayMongo link each month — nothing is stored here and nothing is charged without you.",
    };
  }

  const cardParsed = CardSchema.safeParse({
    cardName: String(formData.get("cardName") ?? ""),
    cardNumber: String(formData.get("cardNumber") ?? ""),
    cardExpMonth: String(formData.get("cardExpMonth") ?? ""),
    cardExpYear: String(formData.get("cardExpYear") ?? ""),
    cardCvc: String(formData.get("cardCvc") ?? ""),
  });
  if (!cardParsed.success) return { errors: firstErrors(cardParsed.error) };

  let card;
  try {
    card = await provider.createPaymentMethod({
      type: "CARD",
      card: {
        number: cardParsed.data.cardNumber,
        expMonth: cardParsed.data.cardExpMonth,
        expYear: cardParsed.data.cardExpYear,
        cvc: cardParsed.data.cardCvc,
        name: cardParsed.data.cardName,
      },
    });
  } catch (error) {
    return {
      errors: {
        cardNumber:
          error instanceof Error
            ? error.message
            : "That card could not be verified.",
      },
    };
  }

  // Single default is enforced here rather than by a partial unique index,
  // which Prisma can't express.
  await prisma.$transaction([
    prisma.savedPaymentMethod.updateMany({
      where: { userId: partner.id, deletedAt: null },
      data: { isDefault: false },
    }),
    prisma.savedPaymentMethod.create({
      data: {
        userId: partner.id,
        type: "CARD",
        isDefault: true,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
        provider: provider.id,
        providerCustomerId: sub.providerCustomerId,
        providerMethodId: card.methodId,
      },
    }),
    prisma.subscription.update({
      where: { id: sub.id },
      data: { method: "CARD", autoRenew: true, version: { increment: 1 } },
    }),
  ]);

  revalidateBilling();
  return { success: "Card saved. Your subscription will renew automatically." };
}

export async function removeCardAction(
  _prev: BillingFormState,
  _formData: FormData
): Promise<BillingFormState> {
  const { partner, sub } = await loadOwnSubscription();
  if (!sub) return { message: "No subscription found." };

  // Soft delete — a historical Payment may reference the row.
  await prisma.savedPaymentMethod.updateMany({
    where: { userId: partner.id, deletedAt: null },
    data: { deletedAt: new Date(), isDefault: false },
  });
  // No card means nothing can auto-renew.
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { autoRenew: false, version: { increment: 1 } },
  });

  revalidateBilling();
  return {
    success: "Card removed. You'll need to pay manually each month.",
  };
}

export async function cancelSubscriptionAction(
  _prev: BillingFormState,
  _formData: FormData
): Promise<BillingFormState> {
  const { sub } = await loadOwnSubscription();
  if (!sub) return { message: "No subscription found." };
  if (sub.cancelAtPeriodEnd) {
    return { message: "This subscription is already set to cancel." };
  }

  // Cancelling never removes access immediately — the partner keeps what they
  // paid for, and CANCELLED only ever means "the period ran out".
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      cancelAtPeriodEnd: true,
      autoRenew: false,
      // A cancelled trial should end when the trial would have.
      currentPeriodEnd:
        sub.status === "TRIALING" && sub.trialEndsAt
          ? sub.trialEndsAt
          : sub.currentPeriodEnd,
      version: { increment: 1 },
    },
  });

  revalidateBilling();
  return {
    success:
      "Subscription cancelled. Your hubs stay in your account and remain listed until the period ends.",
  };
}

export async function resumeSubscriptionAction(
  _prev: BillingFormState,
  _formData: FormData
): Promise<BillingFormState> {
  const { partner, sub } = await loadOwnSubscription();
  if (!sub) return { message: "No subscription found." };

  const card = await prisma.savedPaymentMethod.findFirst({
    where: { userId: partner.id, deletedAt: null, isDefault: true },
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      autoRenew: sub.method === "CARD" && card != null,
      version: { increment: 1 },
    },
  });

  revalidateBilling();
  return { success: "Subscription resumed." };
}
