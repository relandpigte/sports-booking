import "server-only";

import type { PartnerPaymentMode, PaymentCollectionMode } from "@prisma/client";

// The one definition of "can this venue or trainer take payments".
//
// Automatic checkout is collected by Bunal.club's own PayMongo account and
// paid out afterwards, so the only thing a venue or trainer has to set up is
// where that payout goes. Two questions are kept apart on purpose:
//
//   - SETUP ready: they have finished their side. This is what "Verified"
//     means, and it does not flicker when Bunal.club's account changes.
//   - CHECKOUT ready: a new payment can actually be taken right now. For
//     automatic mode that additionally needs the platform account connected.

// Select these on the owning User to evaluate a venue.
export const venueReadinessSelect = {
  partnerPaymentMode: true,
  payoutAccount: { select: { id: true } },
  manualPaymentMethods: {
    where: { active: true },
    take: 1,
    select: { id: true },
  },
} as const;

export type VenueReadinessOwner = {
  partnerPaymentMode: PartnerPaymentMode;
  payoutAccount: { id: string } | null;
  manualPaymentMethods: { id: string }[];
};

export function venueSetupReady(owner: VenueReadinessOwner): boolean {
  return owner.partnerPaymentMode === "MANUAL"
    ? owner.manualPaymentMethods.length > 0
    : owner.payoutAccount != null;
}

export function venueCheckoutReady(
  owner: VenueReadinessOwner,
  platformReady: boolean
): boolean {
  if (!venueSetupReady(owner)) return false;
  return owner.partnerPaymentMode === "MANUAL" || platformReady;
}

// Select these on the trainer's User to evaluate a trainer.
export const trainerReadinessUserSelect = {
  payoutAccount: { select: { id: true } },
  trainerManualMethods: {
    where: { active: true },
    take: 1,
    select: { id: true },
  },
} as const;

export type TrainerReadinessProfile = {
  paymentMode: PaymentCollectionMode;
  user: {
    payoutAccount: { id: string } | null;
    trainerManualMethods: { id: string }[];
  };
};

export function trainerSetupReady(profile: TrainerReadinessProfile): boolean {
  return profile.paymentMode === "MANUAL"
    ? profile.user.trainerManualMethods.length > 0
    : profile.user.payoutAccount != null;
}

export function trainerCheckoutReady(
  profile: TrainerReadinessProfile,
  platformReady: boolean
): boolean {
  if (!trainerSetupReady(profile)) return false;
  return profile.paymentMode === "MANUAL" || platformReady;
}
