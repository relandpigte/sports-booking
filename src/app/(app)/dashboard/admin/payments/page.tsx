import type { Metadata } from "next";

import { PlatformGatewayPanel } from "@/components/admin/PlatformGatewayPanel";
import { requireAdmin } from "@/lib/admin";
import {
  getPlatformGatewayView,
  platformWebhookUrlReachable,
} from "@/lib/platform-gateway";
import { appUrl } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Payment Collection — Bunal.club",
};

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const [gateway, webhookUrlReachable] = await Promise.all([
    getPlatformGatewayView(),
    platformWebhookUrlReachable(),
  ]);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Payment collection
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the Bunal.club PayMongo account used to collect partner
          service-fee settlements.
        </p>
      </div>

      <div className="mt-6">
        <PlatformGatewayPanel
          gateway={gateway}
          webhookUrl={appUrl("/api/billing/webhook/paymongo")}
          webhookUrlReachable={webhookUrlReachable}
        />
      </div>
    </div>
  );
}
