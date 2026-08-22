/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";

import { PartnerServiceFeeBreakdown } from "@/components/admin/PartnerServiceFeeBreakdown";
import { ReverseServiceFeeWaiverForm } from "@/components/admin/ServiceFeeWaiverControls";
import {
  TrainerServiceFeeSettlements,
  type AdminTrainerServiceFeeSettlementView,
} from "@/components/admin/TrainerServiceFeeSettlements";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import { reviewServiceFeeSettlementAction } from "@/lib/service-fee-actions";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  listAdminPartnerServiceFeeBreakdown,
  listAdminServiceFeeSettlements,
  listAdminServiceFeeWaivers,
} from "@/lib/service-fees";

export const metadata: Metadata = {
  title: "Service Fee Settlements — Bunal.club",
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);

type SettlementView = "partners" | "trainers";

function SettlementHeader({
  view,
  partnerPendingCount,
  trainerPendingCount,
}: {
  view: SettlementView;
  partnerPendingCount: number;
  trainerPendingCount: number;
}) {
  const tabs = [
    {
      id: "partners" as const,
      label: "Venue partners",
      href: "/dashboard/admin/settlements",
      pendingCount: partnerPendingCount,
    },
    {
      id: "trainers" as const,
      label: "Trainers",
      href: "/dashboard/admin/settlements?view=trainers",
      pendingCount: trainerPendingCount,
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Service-fee settlements
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Review service-fee remittances from venue partners and approved
          trainers.
        </p>
      </div>

      <nav
        aria-label="Settlement account type"
        className="mt-6 flex gap-6 border-b border-gray-200"
      >
        {tabs.map((tab) => {
          const active = view === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                  tab.pendingCount > 0
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.pendingCount}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default async function AdminSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  const view: SettlementView =
    requestedView === "trainers" ? "trainers" : "partners";

  if (view === "trainers") {
    const [trainerSettlements, partnerPendingCount] = await Promise.all([
      prisma.trainerServiceFeeSettlement.findMany({
        orderBy: { submittedAt: "desc" },
        take: 100,
        include: {
          trainer: {
            select: { email: true, name: true, playerName: true },
          },
        },
      }),
      prisma.serviceFeeSettlement.count({ where: { status: "SUBMITTED" } }),
    ]);
    const settlements: AdminTrainerServiceFeeSettlementView[] =
      trainerSettlements.map(({ trainer, amount, ...settlement }) => ({
        ...settlement,
        amount: Number(amount),
        trainerName:
          trainer.playerName ?? trainer.name ?? trainer.email ?? "Trainer",
        trainerEmail: trainer.email,
      }));
    const trainerPendingCount = settlements.filter(
      (settlement) => settlement.status === "SUBMITTED"
    ).length;

    return (
      <div>
        <SettlementHeader
          view={view}
          partnerPendingCount={partnerPendingCount}
          trainerPendingCount={trainerPendingCount}
        />
        <TrainerServiceFeeSettlements settlements={settlements} />
      </div>
    );
  }

  const [{ submitted, history }, partners, waivers, trainerPendingCount] =
    await Promise.all([
      listAdminServiceFeeSettlements(),
      listAdminPartnerServiceFeeBreakdown(),
      listAdminServiceFeeWaivers(),
      prisma.trainerServiceFeeSettlement.count({
        where: { status: "SUBMITTED" },
      }),
    ]);

  return (
    <div>
      <SettlementHeader
        view={view}
        partnerPendingCount={submitted.length}
        trainerPendingCount={trainerPendingCount}
      />

      <PartnerServiceFeeBreakdown partners={partners} />

      {waivers.length > 0 && (
        <section className="mt-8">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Waiver history
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Administrative credits are tracked separately from cash settlements. Reversals restore the partner balance without deleting history.
            </p>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {waivers.map((waiver) => (
              <article key={waiver.id} className="rounded-2xl border border-primary/15 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{waiver.partnerName}</h3>
                    <p className="text-xs text-gray-500">{waiver.partnerEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-navy">{formatPHP(waiver.amount)}</p>
                    <Badge tone={waiver.reversedAt ? "danger" : "primary"}>
                      {waiver.reversedAt ? "Reversed" : "Waived"}
                    </Badge>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Balance change</dt>
                    <dd className="font-medium text-gray-900">{formatPHP(waiver.balanceBefore)} → {formatPHP(waiver.balanceAfter)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Granted</dt>
                    <dd className="text-right text-gray-900">{formatDate(waiver.grantedAt)} · {waiver.grantedByName}</dd>
                  </div>
                </dl>
                <div className="mt-3 rounded-xl bg-primary-soft px-3 py-2.5">
                  <p className="text-xs font-medium text-navy">{waiver.reason}</p>
                </div>
                {waiver.reversedAt ? (
                  <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
                    <p className="font-bold">Reversed {formatDate(waiver.reversedAt)}{waiver.reversedByName ? ` · ${waiver.reversedByName}` : ""}</p>
                    {waiver.reversalReason ? <p className="mt-1">{waiver.reversalReason}</p> : null}
                  </div>
                ) : (
                  <ReverseServiceFeeWaiverForm waiverId={waiver.id} amount={waiver.amount} />
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-base font-semibold text-gray-900">
          Awaiting review ({submitted.length})
        </h2>
        {submitted.length ? (
          <div className="mt-3 flex flex-col gap-4">
            {submitted.map((settlement) => (
              <article
                key={settlement.id}
                className="grid gap-5 rounded-2xl border border-gray-200 p-5 lg:grid-cols-[1fr_260px]"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {settlement.partnerName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {settlement.partnerEmail}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {formatPHP(settlement.amount)}
                    </p>
                  </div>

                  <dl className="mt-4 flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Reference</dt>
                      <dd className="font-mono text-gray-900">
                        {settlement.paymentReference ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Submitted</dt>
                      <dd className="text-gray-900">
                        {formatDate(settlement.submittedAt)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Fees through</dt>
                      <dd className="text-gray-900">
                        {formatDate(settlement.periodEnd)}
                      </dd>
                    </div>
                  </dl>

                  <form
                    action={reviewServiceFeeSettlementAction}
                    className="mt-5 flex flex-col gap-3"
                  >
                    <input
                      type="hidden"
                      name="settlementId"
                      value={settlement.id}
                    />
                    <textarea
                      name="reviewNote"
                      rows={2}
                      placeholder="Review note (optional)"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value="paid"
                        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
                      >
                        Mark paid
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="rejected"
                        className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Reject proof
                      </button>
                    </div>
                  </form>
                </div>

                {settlement.receiptImage && (
                  <a
                    href={settlement.receiptImage}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                    title="Open receipt"
                  >
                    { }
                    <img
                      src={settlement.receiptImage}
                      alt={`Receipt from ${settlement.partnerName}`}
                      className="h-full max-h-72 w-full object-contain"
                    />
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No settlements are waiting for review.
          </p>
        )}
      </section>

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">
            Review history
          </h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            {history.map((settlement) => (
              <div
                key={settlement.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {settlement.partnerName} · {formatPHP(settlement.amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {settlement.paymentReference ?? "No reference"} ·{" "}
                    {formatDate(settlement.submittedAt)}
                    {settlement.reviewNote
                      ? ` · ${settlement.reviewNote}`
                      : ""}
                  </p>
                </div>
                <Badge
                  tone={settlement.status === "PAID" ? "success" : "danger"}
                >
                  {settlement.status === "PAID" ? "Paid" : "Rejected"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
