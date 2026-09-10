import type { Metadata } from "next";
import type { TrainerSessionStatus } from "@prisma/client";

import { AdminTrainerBookings } from "@/components/admin/AdminTrainerBookings";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { requireAdmin } from "@/lib/admin";
import { listAdminTrainerBookings } from "@/lib/admin-trainer-bookings";

export const metadata: Metadata = { title: "Trainer Bookings — Bunal.club" };

const statuses = [
  "REQUESTED",
  "AWAITING_PAYMENT",
  "PAYMENT_REVIEW",
  "CONFIRMED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
  "COMPLETED",
  "REFUNDED",
] as const satisfies readonly TrainerSessionStatus[];

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function parseStatus(value: string): TrainerSessionStatus | undefined {
  const normalized = value.toUpperCase();
  return statuses.find((status) => status === normalized);
}

export default async function AdminTrainerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = firstValue(params.q).trim().slice(0, 100);
  const status = parseStatus(firstValue(params.status));
  const from = validDate(firstValue(params.from));
  const to = validDate(firstValue(params.to));
  const requestedPage = Number.parseInt(firstValue(params.page), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await listAdminTrainerBookings({
    query,
    status,
    from: from || undefined,
    to: to || undefined,
    page,
  });

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow="Platform oversight"
        title="Trainer bookings"
        description="Review every trainer session, its participants, schedule, status, and payment summary, or remove a selected transaction and its linked booking."
      />
      <AdminTrainerBookings
        result={result}
        query={query}
        status={status}
        from={from}
        to={to}
      />
    </div>
  );
}
