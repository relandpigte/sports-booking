import type { Metadata } from "next";
import type { PaymentStatus, TransactionEnvironment } from "@prisma/client";

import { AdminVenueTransactions } from "@/components/admin/AdminVenueTransactions";
import { PlatformGatewayPanel } from "@/components/admin/PlatformGatewayPanel";
import { requireAdmin } from "@/lib/admin";
import { listAdminVenueTransactions } from "@/lib/admin-transactions";
import {
  getPlatformGatewayView,
  platformWebhookUrlReachable,
} from "@/lib/platform-gateway";
import { appUrl } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Payment Collection — Bunal.club",
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const paymentStatuses = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
] as const satisfies readonly PaymentStatus[];
const transactionEnvironments = [
  "TEST",
  "LIVE",
  "UNKNOWN",
] as const satisfies readonly TransactionEnvironment[];

function parsePaymentStatus(value: string): PaymentStatus | undefined {
  const normalized = value.toUpperCase();
  return paymentStatuses.find((status) => status === normalized);
}

function parseTransactionEnvironment(
  value: string
): TransactionEnvironment | undefined {
  const normalized = value.toUpperCase();
  return transactionEnvironments.find(
    (environment) => environment === normalized
  );
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = firstValue(params.q).trim().slice(0, 100);
  const status = parsePaymentStatus(firstValue(params.status));
  const environment = parseTransactionEnvironment(
    firstValue(params.environment)
  );
  const requestedPage = Number.parseInt(firstValue(params.page), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [gateway, webhookUrlReachable, transactions] = await Promise.all([
    getPlatformGatewayView(),
    platformWebhookUrlReachable(),
    listAdminVenueTransactions({ query, status, environment, page }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Payment collection
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the Bunal.club PayMongo account used to collect partner
          service-fee settlements.
        </p>
      </div>

      <div>
        <PlatformGatewayPanel
          gateway={gateway}
          webhookUrl={appUrl("/api/billing/webhook/paymongo")}
          webhookUrlReachable={webhookUrlReachable}
        />
      </div>
      <AdminVenueTransactions
        result={transactions}
        query={query}
        status={status}
        environment={environment}
      />
    </div>
  );
}
