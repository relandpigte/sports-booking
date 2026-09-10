"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isPartnerImpersonationActive } from "@/lib/impersonation";

export type DeleteVenueTransactionState = {
  message?: string;
};

const DeleteVenueTransactionSchema = z.object({
  paymentId: z.string().trim().min(1).max(191),
  confirmed: z.literal("on"),
});

export async function deleteVenueTransactionAction(
  _previous: DeleteVenueTransactionState,
  formData: FormData
): Promise<DeleteVenueTransactionState> {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) {
    return {
      message: "Exit assisted partner access before deleting a transaction.",
    };
  }

  const parsed = DeleteVenueTransactionSchema.safeParse({
    paymentId: formData.get("paymentId"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return { message: "Confirm that you understand the deletion warning." };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const payment = await tx.bookingPayment.findUnique({
          where: { id: parsed.data.paymentId },
          select: {
            id: true,
            partnerId: true,
            userId: true,
            guestReservationId: true,
            amount: true,
            venueAmount: true,
            platformFee: true,
            status: true,
            environment: true,
            providerRef: true,
            manualPaymentRef: true,
            providerPaymentId: true,
            bookings: { select: { id: true } },
            eventRegistration: {
              select: {
                id: true,
                guests: {
                  where: { bookingPaymentId: { not: null } },
                  select: { bookingPaymentId: true },
                },
              },
            },
            eventGuestSlots: { select: { id: true } },
            serviceFeeEntries: { select: { id: true } },
          },
        });
        if (!payment) return { message: "Transaction not found." };
        if (payment.environment === "LIVE") {
          return {
            message:
              "Live transactions are protected and cannot be deleted from this tool.",
          };
        }

        const otherRegistrationPayments = new Set(
          payment.eventRegistration?.guests
            .map((guest) => guest.bookingPaymentId)
            .filter(
              (paymentId): paymentId is string =>
                paymentId !== null && paymentId !== payment.id
            ) ?? []
        );
        if (otherRegistrationPayments.size > 0) {
          return {
            message:
              "Delete this registration's additional guest transactions first.",
          };
        }

        await tx.booking.deleteMany({
          where: { bookingPaymentId: payment.id },
        });
        if (payment.eventRegistration) {
          await tx.eventRegistration.delete({
            where: { id: payment.eventRegistration.id },
          });
        } else {
          await tx.eventGuestSlot.deleteMany({
            where: { bookingPaymentId: payment.id },
          });
        }
        await tx.bookingPayment.delete({ where: { id: payment.id } });

        if (payment.guestReservationId) {
          const remainingGuestLinks = await Promise.all([
            tx.booking.count({
              where: { guestReservationId: payment.guestReservationId },
            }),
            tx.eventRegistration.count({
              where: { guestReservationId: payment.guestReservationId },
            }),
            tx.bookingPayment.count({
              where: { guestReservationId: payment.guestReservationId },
            }),
          ]);
          if (remainingGuestLinks.every((count) => count === 0)) {
            await tx.guestReservation.deleteMany({
              where: { id: payment.guestReservationId },
            });
          }
        }

        await tx.securityEvent.create({
          data: {
            userId: admin.id,
            type: "ADMIN_VENUE_TRANSACTION_DELETED",
            metadata: {
              paymentId: payment.id,
              partnerId: payment.partnerId,
              playerId: payment.userId,
              reference:
                payment.providerRef ??
                payment.manualPaymentRef ??
                payment.providerPaymentId ??
                payment.id,
              amount: Number(payment.amount),
              venueAmount: Number(payment.venueAmount),
              platformFee: Number(payment.platformFee),
              status: payment.status,
              environment: payment.environment,
              bookingCount: payment.bookings.length,
              eventGuestCount: payment.eventGuestSlots.length,
              serviceFeeEntryCount: payment.serviceFeeEntries.length,
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
      "Admin venue transaction deletion failed:",
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `${error.code}: ${error.message}`
        : error
    );
    return {
      message:
        "The transaction could not be deleted. No changes were saved; please try again.",
    };
  }

  revalidatePath("/", "layout");
  return {};
}
