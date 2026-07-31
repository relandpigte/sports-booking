"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { isImageDataUrl } from "@/lib/avatar";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { requireActivePartner } from "@/lib/dal";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import { calculateServiceFeeBalance } from "@/lib/service-fees";
import { startServiceFeeCheckout } from "@/lib/service-fee-payments";

const MAX_RECEIPT_BYTES = 800 * 1024;

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
  const partner = await requireActivePartner();
  const paymentReference = String(
    formData.get("paymentReference") ?? ""
  ).trim();
  const receiptImage = String(formData.get("receiptImage") ?? "").trim();

  const errors: Record<string, string> = {};
  if (paymentReference.length < 4) {
    errors.paymentReference = "Enter the payment reference";
  } else if (paymentReference.length > 120) {
    errors.paymentReference = "Keep the reference under 120 characters";
  }
  if (!isImageDataUrl(receiptImage, MAX_RECEIPT_BYTES)) {
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
      "Settlement submitted. New bookings stay active while the admin reviews it.",
  };
}

class ActivePaymongoCheckoutError extends Error {}

export async function startServiceFeeCheckoutAction(
  _prev: ServiceFeeFormState,
  _formData: FormData
): Promise<ServiceFeeFormState> {
  const partner = await requireActivePartner();
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
    case "failed":
      return { message: result.message };
  }
}

export async function reviewServiceFeeSettlementAction(formData: FormData) {
  const admin = await requireAdmin();
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
