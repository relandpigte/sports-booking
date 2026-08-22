/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";

import { PartnerServiceFeeBreakdown } from "@/components/admin/PartnerServiceFeeBreakdown";
import { ReverseServiceFeeWaiverForm } from "@/components/admin/ServiceFeeWaiverControls";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import { reviewServiceFeeSettlementAction } from "@/lib/service-fee-actions";
import { reviewTrainerServiceFeeSettlementAction } from "@/lib/trainer-payment-actions";
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

export default async function AdminSettlementsPage() {
  await requireAdmin();
  const [{ submitted, history }, partners, waivers, trainerSettlements] = await Promise.all([
    listAdminServiceFeeSettlements(),
    listAdminPartnerServiceFeeBreakdown(),
    listAdminServiceFeeWaivers(),
    prisma.trainerServiceFeeSettlement.findMany({
      orderBy: { submittedAt: "desc" },
      include: { trainer: { select: { email: true, name: true, playerName: true } } },
    }),
  ]);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Service-fee settlements
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Verify partner remittances before crediting their automatic and
          manual checkout service-fee balance.
        </p>
      </div>

      <PartnerServiceFeeBreakdown partners={partners} />

      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-900">Trainer settlements</h2>
        <p className="mt-1 text-sm text-gray-500">Review remittances for the 3% added to trainer sessions.</p>
        <div className="mt-3 space-y-3">
          {trainerSettlements.map((settlement) => (
            <article key={settlement.id} className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 lg:grid-cols-[1fr_220px]">
              <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{settlement.trainer.playerName ?? settlement.trainer.name ?? settlement.trainer.email}</h3><p className="text-xs text-gray-500">{settlement.trainer.email}</p></div><div className="text-right"><p className="font-bold text-navy">{formatPHP(Number(settlement.amount))}</p><Badge tone={settlement.status === "PAID" ? "success" : settlement.status === "REJECTED" ? "danger" : "warn"}>{settlement.status.replaceAll("_", " ")}</Badge></div></div><p className="mt-3 text-sm text-slate-600">Reference: <span className="font-mono">{settlement.paymentReference ?? "—"}</span> · {formatDate(settlement.submittedAt)}</p>{settlement.status === "SUBMITTED" && <form action={reviewTrainerServiceFeeSettlementAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="settlementId" value={settlement.id} /><input name="note" placeholder="Review note (optional)" className="min-h-10 min-w-48 flex-1 rounded-lg border border-gray-200 px-3 text-sm" /><button name="decision" value="PAID" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Mark paid</button><button name="decision" value="REJECTED" className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-700">Reject</button></form>}</div>{settlement.receiptImage && <a href={settlement.receiptImage} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-slate-50">{ }<img src={settlement.receiptImage} alt="Trainer settlement receipt" className="max-h-56 w-full object-contain" /></a>}</article>
          ))}
          {trainerSettlements.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No trainer settlements yet.</p>}
        </div>
      </section>

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
