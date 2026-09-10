"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isPartnerImpersonationActive } from "@/lib/impersonation";

export type DeleteTrainerTransactionState = {
  message?: string;
};

const DeleteTrainerTransactionSchema = z.object({
  sessionId: z.string().trim().min(1).max(191),
  paymentId: z.string().trim().min(1).max(191),
  confirmed: z.literal("on"),
});

export async function deleteTrainerTransactionAction(
  _previous: DeleteTrainerTransactionState,
  formData: FormData
): Promise<DeleteTrainerTransactionState> {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) {
    return {
      message: "Exit assisted partner access before deleting a transaction.",
    };
  }

  const parsed = DeleteTrainerTransactionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    paymentId: formData.get("paymentId"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return { message: "Confirm that you understand the deletion warning." };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const session = await tx.trainerSession.findUnique({
          where: { id: parsed.data.sessionId },
          select: {
            id: true,
            publicId: true,
            playerId: true,
            status: true,
            totalAmount: true,
            trainerAmount: true,
            platformFee: true,
            slots: { select: { id: true } },
            conversation: { select: { id: true } },
            trainer: { select: { userId: true } },
            payment: {
              select: {
                id: true,
                status: true,
                providerRef: true,
                manualPaymentRef: true,
                providerPaymentId: true,
                serviceFeeEntries: { select: { id: true } },
              },
            },
          },
        });
        if (!session || session.payment?.id !== parsed.data.paymentId) {
          return { message: "Trainer transaction not found." };
        }

        await tx.trainerSession.delete({ where: { id: session.id } });
        await tx.securityEvent.create({
          data: {
            userId: admin.id,
            type: "ADMIN_TRAINER_TRANSACTION_DELETED",
            metadata: {
              trainerSessionId: session.id,
              paymentId: session.payment.id,
              publicId: session.publicId,
              trainerId: session.trainer.userId,
              playerId: session.playerId,
              reference:
                session.payment.providerRef ??
                session.payment.manualPaymentRef ??
                session.payment.providerPaymentId ??
                session.payment.id,
              totalAmount: Number(session.totalAmount),
              trainerAmount: Number(session.trainerAmount),
              platformFee: Number(session.platformFee),
              sessionStatus: session.status,
              paymentStatus: session.payment.status,
              slotCount: session.slots.length,
              conversationDeleted: Boolean(session.conversation),
              serviceFeeEntryCount: session.payment.serviceFeeEntries.length,
            },
          },
        });

        return {};
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 30_000 }
    );
    if (result.message) return result;
  } catch (error) {
    console.error(
      "Admin trainer transaction deletion failed:",
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `${error.code}: ${error.message}`
        : error
    );
    return {
      message:
        "The trainer transaction could not be deleted. No changes were saved; please try again.",
    };
  }

  revalidatePath("/", "layout");
  return {};
}
