"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { sanitizeImageDataUrl } from "@/lib/avatar";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { requireActivePartner, requireRecentMfa } from "@/lib/dal";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import { calculateServiceFeeBalance } from "@/lib/service-fees";
import { startServiceFeeCheckout } from "@/lib/service-fee-payments";
import { isPartnerImpersonationActive } from "@/lib/impersonation";
import { consumeRateLimit } from "@/lib/rate-limit";

export type ServiceFeeFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  redirectUrl?: string;
};

function revalidateSettlementSurfaces() {
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/settlements");
  revalidatePath("/hubs");
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
