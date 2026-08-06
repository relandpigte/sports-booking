import "server-only";

import type {
  ManualPaymentNetwork,
  PartnerPaymentMode,
} from "@prisma/client";

import { prisma } from "@/lib/db";

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
  automaticReady: boolean;
  manualReady: boolean;
  gateway: { id: string; provider: string } | null;
};

export async function getPartnerPaymentSetup(
  partnerId: string
): Promise<PartnerPaymentSetup> {
  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    select: {
      partnerPaymentMode: true,
      partnerGateway: {
        select: { id: true, provider: true, disconnectedAt: true },
      },
      manualPaymentMethods: {
        where: { active: true },
        take: 1,
        select: { id: true },
      },
    },
  });
  const gateway =
    partner?.partnerGateway && partner.partnerGateway.disconnectedAt == null
      ? {
          id: partner.partnerGateway.id,
          provider: partner.partnerGateway.provider,
        }
      : null;
  return {
    mode: partner?.partnerPaymentMode ?? "AUTOMATIC",
    automaticReady: gateway != null,
    manualReady: (partner?.manualPaymentMethods.length ?? 0) > 0,
    gateway,
  };
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
