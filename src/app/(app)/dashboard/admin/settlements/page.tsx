/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";

import { PartnerServiceFeeBreakdown } from "@/components/admin/PartnerServiceFeeBreakdown";
import { ReverseServiceFeeWaiverForm } from "@/components/admin/ServiceFeeWaiverControls";
import { SettlementDisclosure } from "@/components/admin/SettlementDisclosure";
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
import {
  listAdminTrainerServiceFeeBreakdown,
  listAdminTrainerServiceFeeTransactions,
} from "@/lib/trainer-service-fees";

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
  partnerCount,
  trainerCount,
}: {
  view: SettlementView;
  partnerCount: number;
  trainerCount: number;
}) {
  const tabs = [
    {
      id: "partners" as const,
      label: "Venue partners",
      href: "/dashboard/admin/settlements",
      count: partnerCount,
    },
    {
      id: "trainers" as const,
      label: "Trainers",
      href: "/dashboard/admin/settlements?view=trainers",
      count: trainerCount,
    },
  ];

  return (
    <>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Admin finance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">
            Service-fee settlements
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review remittances from venue partners and approved trainers in
            separate workspaces.
          </p>
        </div>
        <p className="shrink-0 text-xs text-gray-400">
          Dates use Asia/Manila time
        </p>
      </header>

      <nav
        aria-label="Settlement account type"
        className="mt-4 flex gap-7 border-b border-gray-200"
      >
        {tabs.map((tab) => {
          const active = view === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2 border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                  active
                    ? "bg-primary-soft text-primary"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.count}
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
    const [
      trainerSettlements,
      trainerBalances,
      trainerTransactions,
      partnerCount,
      trainerCount,
    ] = await Promise.all([
      prisma.trainerServiceFeeSettlement.findMany({
        orderBy: { submittedAt: "desc" },
        take: 100,
        include: {
          trainer: {
            select: { email: true, name: true, playerName: true },
          },
        },
      }),
      listAdminTrainerServiceFeeBreakdown(),
      listAdminTrainerServiceFeeTransactions(),
      prisma.user.count({ where: { role: "PARTNER" } }),
      prisma.trainerProfile.count({ where: { status: "ACTIVE" } }),
    ]);
    const settlements: AdminTrainerServiceFeeSettlementView[] =
      trainerSettlements.map(({ trainer, amount, ...settlement }) => ({
        ...settlement,
        amount: Number(amount),
        trainerName:
          trainer.playerName ?? trainer.name ?? trainer.email ?? "Trainer",
        trainerEmail: trainer.email,
      }));
    return (
      <div>
        <SettlementHeader
          view={view}
          partnerCount={partnerCount}
          trainerCount={trainerCount}
        />
        <TrainerServiceFeeSettlements
          balances={trainerBalances}
          transactions={trainerTransactions}
          settlements={settlements}
        />
      </div>
    );
  }

  const [{ submitted, history }, partners, waivers, trainerCount] =
    await Promise.all([
      listAdminServiceFeeSettlements(),
      listAdminPartnerServiceFeeBreakdown(),
      listAdminServiceFeeWaivers(),
      prisma.trainerProfile.count({ where: { status: "ACTIVE" } }),
    ]);
  const activeWaiverCount = waivers.filter(
    (waiver) => waiver.reversedAt === null
  ).length;
  const reversedWaiverCount = waivers.length - activeWaiverCount;
  const paidReviewCount = history.filter(
    (settlement) => settlement.status === "PAID"
  ).length;
  const rejectedReviewCount = history.length - paidReviewCount;

  return (
    <div>
      <SettlementHeader
        view={view}
        partnerCount={partners.length}
        trainerCount={trainerCount}
      />

      <PartnerServiceFeeBreakdown partners={partners} />

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-navy">
              Awaiting review ({submitted.length})
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Verify each receipt before completing a partner remittance.
            </p>
          </div>
          {submitted.length > 0 ? (
            <Badge tone="warn">Action required</Badge>
          ) : null}
        </div>
        {submitted.length ? (
          <div className="mt-3 flex flex-col gap-3">
            {submitted.map((settlement) => (
              <article
                key={settlement.id}
                className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_220px]"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-navy">
                        {settlement.partnerName}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {settlement.partnerEmail}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums text-navy">
                        {formatPHP(settlement.amount)}
                      </p>
                      <Badge tone="warn">Submitted</Badge>
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-[11px] text-gray-500">Reference</dt>
                      <dd className="mt-0.5 break-all font-mono text-gray-900">
                        {settlement.paymentReference ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Submitted</dt>
                      <dd className="mt-0.5 text-gray-900">
                        {formatDate(settlement.submittedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Fees through</dt>
                      <dd className="mt-0.5 text-gray-900">
                        {formatDate(settlement.periodEnd)}
                      </dd>
                    </div>
                  </dl>

                  <form
                    action={reviewServiceFeeSettlementAction}
                    className="mt-4 flex flex-col gap-2.5"
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
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value="paid"
                        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
                      >
                        Mark paid
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="rejected"
                        className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Reject proof
                      </button>
                    </div>
                  </form>
                </div>

                {settlement.receiptImage ? (
                  <a
                    href={settlement.receiptImage}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                    title="Open receipt"
                  >
                    <img
                      src={settlement.receiptImage}
                      alt={`Receipt from ${settlement.partnerName}`}
                      className="h-full max-h-56 w-full object-contain"
                    />
                  </a>
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-center text-xs text-gray-500">
                    No receipt image attached
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-xs text-gray-500">
            No settlements are waiting for review.
          </p>
        )}
      </section>

      <section className="mt-6 space-y-3" aria-label="Partner settlement audit sections">
        <SettlementDisclosure
          title="Waiver history"
          count={waivers.length}
          description={`${activeWaiverCount} active · ${reversedWaiverCount} reversed · administrative credits tracked separately`}
          label="waiver history"
        >
          {waivers.length ? (
            <div className="divide-y divide-gray-200">
              {waivers.map((waiver) => (
                <article key={waiver.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-navy">
                        {waiver.partnerName}
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        {waiver.partnerEmail}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-navy">
                        {formatPHP(waiver.amount)}
                      </p>
                      <Badge tone={waiver.reversedAt ? "danger" : "primary"}>
                        {waiver.reversedAt ? "Reversed" : "Waived"}
                      </Badge>
                    </div>
                  </div>
                  <dl className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
                    <div>
                      <dt className="text-gray-500">Balance change</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">
                        {formatPHP(waiver.balanceBefore)} → {formatPHP(waiver.balanceAfter)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Granted</dt>
                      <dd className="mt-0.5 text-gray-900">
                        {waiver.grantedByName} · {formatDate(waiver.grantedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Reason</dt>
                      <dd className="mt-0.5 text-gray-900">{waiver.reason}</dd>
                    </div>
                  </dl>
                  {waiver.reversedAt ? (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
                      <p className="font-semibold">
                        Reversed
                        {waiver.reversedByName
                          ? ` by ${waiver.reversedByName}`
                          : ""}
                        {` · ${formatDate(waiver.reversedAt)}`}
                      </p>
                      {waiver.reversalReason ? (
                        <p className="mt-0.5">{waiver.reversalReason}</p>
                      ) : null}
                    </div>
                  ) : (
                    <ReverseServiceFeeWaiverForm
                      waiverId={waiver.id}
                      amount={waiver.amount}
                    />
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">
              No service-fee waivers have been granted yet.
            </p>
          )}
        </SettlementDisclosure>

        <SettlementDisclosure
          title="Review history"
          count={history.length}
          description={`${paidReviewCount} paid · ${rejectedReviewCount} rejected · completed remittance decisions`}
          label="review history"
        >
          {history.length ? (
            <div className="divide-y divide-gray-200">
            {history.map((settlement) => (
              <article
                key={settlement.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">
                    {settlement.partnerName}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {settlement.partnerEmail}
                  </p>
                  <p className="mt-1 break-all text-[11px] text-gray-500">
                    <span className="font-mono">
                      {settlement.paymentReference ?? "No reference"}
                    </span>{" "}
                    · Reviewed {formatDate(settlement.reviewedAt ?? settlement.submittedAt)}
                  </p>
                  {settlement.reviewNote ? (
                    <p className="mt-1 text-xs text-gray-600">
                      {settlement.reviewNote}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <p className="text-sm font-semibold tabular-nums text-navy">
                    {formatPHP(settlement.amount)}
                  </p>
                  <Badge
                    tone={settlement.status === "PAID" ? "success" : "danger"}
                  >
                    {settlement.status === "PAID" ? "Paid" : "Rejected"}
                  </Badge>
                </div>
              </article>
            ))}
            </div>
          ) : (
            <p className="bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">
              No partner settlements have been reviewed yet.
            </p>
          )}
        </SettlementDisclosure>
      </section>
    </div>
  );
}
