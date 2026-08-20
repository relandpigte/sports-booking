"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { sanitizeImageDataUrl } from "@/lib/avatar";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { requireActivePartner, requireRecentMfa } from "@/lib/dal";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import { calculateServiceFeeBalance } from "@/lib/service-fees";
import { startServiceFeeCheckout } from "@/lib/service-fee-payments";
import { isPartnerImpersonationActive } from "@/lib/impersonation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { firstErrors } from "@/lib/zod-errors";

export type ServiceFeeFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  redirectUrl?: string;
};

function revalidateSettlementSurfaces() {
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/settlements");
  revalidatePath("/hubs");
  revalidatePath("/events");
}

const WaiveServiceFeeSchema = z.object({
  partnerId: z.string().trim().min(1, { error: "Partner not found." }),
  amount: z.coerce
    .number()
    .finite()
    .min(0.01, { error: "Enter at least ₱0.01." })
    .max(1_000_000, { error: "The waiver amount is too high." })
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      { error: "Use no more than two decimal places." }
    ),
  reason: z
    .string()
    .trim()
    .min(10, { error: "Give a reason of at least 10 characters." })
    .max(500, { error: "Keep the reason under 500 characters." }),
});

const ReverseServiceFeeWaiverSchema = z.object({
  waiverId: z.string().trim().min(1, { error: "Waiver not found." }),
  reason: z
    .string()
    .trim()
    .min(10, { error: "Give a reversal reason of at least 10 characters." })
    .max(500, { error: "Keep the reason under 500 characters." }),
});

class ActiveServiceFeeSettlementError extends Error {}
class ServiceFeeWaiverAmountError extends Error {
  constructor(readonly amountDue: number) {
    super("Invalid service-fee waiver amount");
  }
}

export async function waiveServiceFeeBalanceAction(
  _prev: ServiceFeeFormState,
  formData: FormData
): Promise<ServiceFeeFormState> {
  const admin = await requireAdmin();
  await requireRecentMfa("/dashboard/admin/settlements");
  const parsed = WaiveServiceFeeSchema.safeParse({
    partnerId: String(formData.get("partnerId") ?? ""),
    amount: formData.get("amount"),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  if (!(await consumeRateLimit({
    namespace: "admin-service-fee-waiver",
    subject: admin.id,
    limit: 20,
    windowSeconds: 60 * 60,
  }))) {
    return { message: "Too many waiver attempts. Wait before trying again." };
  }

  const amount = Math.round(parsed.data.amount * 100) / 100;
  try {
    const waiver = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${parsed.data.partnerId} FOR UPDATE`
        );
        const partner = await tx.user.findFirst({
          where: { id: parsed.data.partnerId, role: "PARTNER" },
          select: { id: true },
        });
        if (!partner) return null;

        const activeSettlement = await tx.serviceFeeSettlement.count({
          where: {
            partnerId: partner.id,
            status: { in: ["SUBMITTED", "AWAITING_PAYMENT"] },
          },
        });
        if (activeSettlement > 0) {
          throw new ActiveServiceFeeSettlementError();
        }

        const balance = await calculateServiceFeeBalance(tx, partner.id);
        if (amount > balance.amountDue || balance.amountDue < 0.01) {
          throw new ServiceFeeWaiverAmountError(balance.amountDue);
        }
        const balanceAfter = Math.round((balance.amountDue - amount) * 100) / 100;
        return tx.serviceFeeWaiver.create({
          data: {
            partnerId: partner.id,
            amount: new Prisma.Decimal(amount),
            reason: parsed.data.reason,
            grantedById: admin.id,
            balanceBefore: new Prisma.Decimal(balance.amountDue),
            balanceAfter: new Prisma.Decimal(balanceAfter),
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if (!waiver) return { message: "Partner not found." };
  } catch (error) {
    if (error instanceof ActiveServiceFeeSettlementError) {
      return {
        message:
          "This partner has a submitted receipt or active PayMongo settlement. Resolve it before granting a waiver.",
      };
    }
    if (error instanceof ServiceFeeWaiverAmountError) {
      return {
        errors: {
          amount:
            error.amountDue < 0.01
              ? "This partner has no outstanding balance."
              : `Enter no more than ₱${error.amountDue.toFixed(2)}.`,
        },
      };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return { message: "The balance changed. Review it and try again." };
    }
    throw error;
  }

  revalidateSettlementSurfaces();
  return { success: `₱${amount.toFixed(2)} service-fee waiver granted.` };
}

export async function reverseServiceFeeWaiverAction(
  _prev: ServiceFeeFormState,
  formData: FormData
): Promise<ServiceFeeFormState> {
  const admin = await requireAdmin();
  await requireRecentMfa("/dashboard/admin/settlements");
  const parsed = ReverseServiceFeeWaiverSchema.safeParse({
    waiverId: String(formData.get("waiverId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "ServiceFeeWaiver" WHERE "id" = ${parsed.data.waiverId} FOR UPDATE`
        );
        const waiver = await tx.serviceFeeWaiver.findUnique({
          where: { id: parsed.data.waiverId },
          select: {
            id: true,
            partnerId: true,
            amount: true,
            reversedAt: true,
          },
        });
        if (!waiver) return { status: "missing" as const, amount: 0 };
        if (waiver.reversedAt) {
          return { status: "reversed" as const, amount: Number(waiver.amount) };
        }

        const before = await calculateServiceFeeBalance(tx, waiver.partnerId);
        const reversedAt = new Date();
        await tx.serviceFeeWaiver.update({
          where: { id: waiver.id },
          data: {
            reversedAt,
            reversedById: admin.id,
            reversalReason: parsed.data.reason,
            reversalBalanceBefore: new Prisma.Decimal(before.amountDue),
          },
        });
        const after = await calculateServiceFeeBalance(tx, waiver.partnerId);
        await tx.serviceFeeWaiver.update({
          where: { id: waiver.id },
          data: {
            reversalBalanceAfter: new Prisma.Decimal(after.amountDue),
          },
        });
        return { status: "reversed-now" as const, amount: Number(waiver.amount) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if (result.status === "missing") return { message: "Waiver not found." };
    if (result.status === "reversed") {
      return { message: "This waiver has already been reversed." };
    }
    revalidateSettlementSurfaces();
    return {
      success: `₱${result.amount.toFixed(2)} waiver reversed. The partner balance has been restored.`,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return { message: "The balance changed. Review it and try again." };
    }
    throw error;
  }
}

export async function submitServiceFeeSettlementAction(
  _prev: ServiceFeeFormState,
  formData: FormData
): Promise<ServiceFeeFormState> {
  if (await isPartnerImpersonationActive()) {
    return {
      message:
        "Settlement payments and receipt submissions are protected during assisted access.",
    };
  }
  const partner = await requireActivePartner();
  await requireRecentMfa("/dashboard/payments");
  if (!(await consumeRateLimit({
    namespace: "service-fee-settlement-submit",
    subject: partner.id,
    limit: 3,
    windowSeconds: 24 * 60 * 60,
  }))) {
    return {
      message:
        "Too many settlement submissions. Wait before submitting another receipt.",
    };
  }
  const paymentReference = String(
    formData.get("paymentReference") ?? ""
  ).trim();
  const rawReceiptImage = String(formData.get("receiptImage") ?? "").trim();
  const receiptImage = await sanitizeImageDataUrl(rawReceiptImage, "receipt");

  const errors: Record<string, string> = {};
  if (paymentReference.length < 4) {
    errors.paymentReference = "Enter the payment reference";
  } else if (paymentReference.length > 120) {
    errors.paymentReference = "Keep the reference under 120 characters";
  }
  if (!receiptImage) {
    errors.receiptImage =
      "Upload a valid JPG, PNG, or WebP receipt under 800KB";
  }
  if (Object.keys(errors).length) return { errors };

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const awaitingPaymongo = await tx.serviceFeeSettlement.count({
          where: {
            partnerId: partner.id,
            status: "AWAITING_PAYMENT",
            provider: "paymongo",
          },
        });
        if (awaitingPaymongo > 0) throw new ActivePaymongoCheckoutError();
        const submitted = await tx.serviceFeeSettlement.count({
          where: { partnerId: partner.id, status: "SUBMITTED" },
        });
        if (submitted > 0) throw new SettlementUnderReviewError();

        const balance = await calculateServiceFeeBalance(tx, partner.id);
        if (balance.amountDue < 0.01) return null;

        return tx.serviceFeeSettlement.create({
          data: {
            partnerId: partner.id,
            periodStart: balance.oldestEntryAt ?? new Date(),
            periodEnd: new Date(),
            amount: new Prisma.Decimal(balance.amountDue),
            paymentReference,
            receiptImage,
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (!result) {
      return { message: "There is no outstanding service-fee balance." };
    }
  } catch (error) {
    if (error instanceof ActivePaymongoCheckoutError) {
      return {
        message:
          "A PayMongo checkout is already active. Finish or let it expire before submitting a manual transfer.",
      };
    }
    if (error instanceof SettlementUnderReviewError) {
      return {
        message:
          "A settlement receipt is already under review. Wait for the admin decision before submitting another.",
      };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return { message: "The balance changed. Please submit the receipt again." };
    }
    throw error;
  }

  revalidateSettlementSurfaces();
  return {
    success:
      "Settlement submitted for review. Any overdue booking restriction remains until the payment is approved.",
  };
}

class ActivePaymongoCheckoutError extends Error {}
class SettlementUnderReviewError extends Error {}

export async function startServiceFeeCheckoutAction(
  _prev: ServiceFeeFormState,
  _formData: FormData
): Promise<ServiceFeeFormState> {
  if (await isPartnerImpersonationActive()) {
    return {
      message:
        "Settlement payments are protected during assisted access.",
    };
  }
  const partner = await requireActivePartner();
  await requireRecentMfa("/dashboard/payments");
  if (!(await platformPaymongoConfigured())) {
    return {
      message:
        "PayMongo payments are not configured yet. Use the manual transfer option below.",
    };
  }

  const result = await startServiceFeeCheckout({
    partnerId: partner.id,
    partnerName: partner.name ?? partner.email,
  });
  revalidateSettlementSurfaces();

  switch (result.status) {
    case "redirect":
      return { redirectUrl: result.url };
    case "paid":
      return { success: "Payment received. Your balance is settled." };
    case "none":
      return { message: "There is no outstanding service-fee balance." };
    case "pending":
      return {
        success:
          "Your PayMongo checkout is being prepared. Refresh and try again in a moment.",
      };
    case "under-review":
      return {
        message:
          "A manual settlement receipt is already under review. Wait for the admin decision before starting another payment.",
      };
    case "failed":
      return { message: result.message };
  }
}

export async function reviewServiceFeeSettlementAction(formData: FormData) {
  const admin = await requireAdmin();
  await requireRecentMfa("/dashboard/admin/settlements");
  const settlementId = String(formData.get("settlementId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 500);
  if (!settlementId || !["paid", "rejected"].includes(decision)) return;

  await prisma.serviceFeeSettlement.updateMany({
    where: { id: settlementId, status: "SUBMITTED" },
    data: {
      status: decision === "paid" ? "PAID" : "REJECTED",
      reviewedAt: new Date(),
      reviewedById: admin.id,
      reviewNote: reviewNote || null,
    },
  });

  revalidateSettlementSurfaces();
}
