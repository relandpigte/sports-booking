import "server-only";

import type {
  ManualPaymentNetwork,
  PartnerPaymentMode,
  TransactionEnvironment,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  venueCheckoutReady,
  venueReadinessSelect,
} from "@/lib/payment-readiness";
import { getPlatformCollectionStatus } from "@/lib/platform-gateway";

export type ManualPaymentMethodView = {
  id: string;
  network: ManualPaymentNetwork;
  label: string;
  accountName: string | null;
  accountIdentifier: string | null;
  instructions: string | null;
  qrImage: string | null;
  active: boolean;
  sortOrder: number;
};

export type PartnerPaymentSetup = {
  mode: PartnerPaymentMode;
  // The partner has finished their side of automatic checkout: a payout
  // account is on file.
  payoutAccountReady: boolean;
  manualReady: boolean;
  // A NEW automatic payment can be taken right now — the payout account is on
  // file AND Bunal.club's own PayMongo account is connected.
  automaticReady: boolean;
  // The key mode of the platform account, snapshotted onto each payment.
  platformEnvironment: TransactionEnvironment;
};

// Whether the partner has completed the setup for the mode they selected.
// This is what "Verified" means; it deliberately ignores the platform account
// so a venue's own onboarding state never changes underneath it.
export function isPartnerPaymentReady(setup: PartnerPaymentSetup): boolean {
  return setup.mode === "MANUAL"
    ? setup.manualReady
    : setup.payoutAccountReady;
}

export async function getPartnerPaymentSetup(
  partnerId: string
): Promise<PartnerPaymentSetup> {
  const [partner, platform] = await Promise.all([
    prisma.user.findUnique({
      where: { id: partnerId },
      select: venueReadinessSelect,
    }),
    getPlatformCollectionStatus(),
  ]);
  const owner = {
    partnerPaymentMode: partner?.partnerPaymentMode ?? "AUTOMATIC",
    payoutAccount: partner?.payoutAccount ?? null,
    manualPaymentMethods: partner?.manualPaymentMethods ?? [],
  };
  return {
    mode: owner.partnerPaymentMode,
    payoutAccountReady: owner.payoutAccount != null,
    manualReady: owner.manualPaymentMethods.length > 0,
    automaticReady: venueCheckoutReady(
      { ...owner, partnerPaymentMode: "AUTOMATIC" },
      platform.ready
    ),
    platformEnvironment: platform.environment,
  };
}

// The columns that say which rail a new court or event payment runs on. Every
// creator spreads this one object, so the rail can never be half-set: a manual
// transfer is collected directly by the venue, and an automatic payment is
// collected by Bunal.club's account and owed back as a payout.
export function checkoutRailColumns(
  setup: Pick<PartnerPaymentSetup, "platformEnvironment">,
  manualPayment: boolean
) {
  return manualPayment
    ? ({
        gatewayId: null,
        collectedBy: "DIRECT",
        processingFeeResponsibility: "PLAYER",
        method: "MANUAL",
        collectionMode: "MANUAL",
        environment: "UNKNOWN",
        provider: "manual",
      } as const)
    : ({
        gatewayId: null,
        collectedBy: "PLATFORM",
        processingFeeResponsibility: "BUNAL",
        method: "QRPH",
        collectionMode: "AUTOMATIC",
        environment: setup.platformEnvironment,
        provider: "paymongo",
      } as const);
}

export async function getPartnerManualPaymentSettings(partnerId: string) {
  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    select: {
      partnerPaymentMode: true,
      manualPaymentMethods: {
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          network: true,
          label: true,
          accountName: true,
          accountIdentifier: true,
          instructions: true,
          qrImage: true,
          active: true,
          sortOrder: true,
        },
      },
    },
  });
  return {
    mode: partner?.partnerPaymentMode ?? "AUTOMATIC",
    methods: partner?.manualPaymentMethods ?? [],
  };
}

export async function getActiveManualPaymentMethods(
  partnerId: string
): Promise<ManualPaymentMethodView[]> {
  return prisma.partnerManualPaymentMethod.findMany({
    where: { partnerId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      network: true,
      label: true,
      accountName: true,
      accountIdentifier: true,
      instructions: true,
      qrImage: true,
      active: true,
      sortOrder: true,
    },
  });
}

export function manualNetworkPaymentMethod(
  network: ManualPaymentNetwork
) {
  switch (network) {
    case "GCASH":
      return "GCASH" as const;
    case "MAYA":
      return "MAYA" as const;
    case "BANK_TRANSFER":
      return "BANK_TRANSFER" as const;
    default:
      return "OTHER" as const;
  }
}
