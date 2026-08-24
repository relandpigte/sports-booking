import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ServiceFeeWaiverForm } from "@/components/admin/ServiceFeeWaiverControls";
import { formatPHP } from "@/lib/currency";
import type {
  AdminPartnerServiceFeeBreakdown,
  ServiceFeeStanding,
} from "@/lib/service-fees";

const standingMeta: Record<
  ServiceFeeStanding,
  { label: string; tone: BadgeTone }
> = {
  OVERDUE: { label: "Overdue", tone: "danger" },
  GRACE_PERIOD: { label: "3-day grace", tone: "warn" },
  UNDER_REVIEW: { label: "Under review", tone: "warn" },
  DUE_SOON: { label: "Due soon", tone: "warn" },
  CURRENT: { label: "Current", tone: "success" },
  NO_BALANCE: { label: "No balance", tone: "neutral" },
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(date));

export function PartnerServiceFeeBreakdown({
  partners,
}: {
  partners: AdminPartnerServiceFeeBreakdown[];
}) {
  const totals = partners.reduce(
    (summary, partner) => ({
      outstanding: summary.outstanding + partner.balance.amountDue,
      pending: summary.pending + partner.balance.pending,
      overdue: summary.overdue + partner.balance.overdueAmount,
      waived: summary.waived + partner.balance.waived,
    }),
    { outstanding: 0, pending: 0, overdue: 0, waived: 0 }
  );

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-navy">
            Partner fee status
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-gray-500">
            Current and no-balance partners are not due. Due-soon balances are
            still within their deadline; overdue balances receive a three-day
            enforcement grace before paid bookings pause.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Deadlines use Asia/Manila time
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-5">
        <div className="border-b border-r border-gray-200 px-4 py-3 lg:border-b-0">
          <dt className="text-[11px] font-medium text-gray-500">Partners</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
            {partners.length}
          </dd>
        </div>
        <div className="border-b border-gray-200 px-4 py-3 lg:border-b-0 lg:border-r">
          <dt className="text-[11px] font-medium text-gray-500">
            Outstanding
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
            {formatPHP(totals.outstanding)}
          </dd>
        </div>
        <div className="border-b border-r border-amber-100 bg-amber-50 px-4 py-3 lg:border-b-0">
          <dt className="text-[11px] font-semibold text-amber-700">
            Under review
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-amber-900">
            {formatPHP(totals.pending)}
          </dd>
        </div>
        <div className="border-b border-gray-200 bg-primary-soft px-4 py-3 lg:border-b-0 lg:border-r">
          <dt className="text-[11px] font-semibold text-primary">Waived</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
            {formatPHP(totals.waived)}
          </dd>
        </div>
        <div className="col-span-2 bg-red-50 px-4 py-3 lg:col-span-1">
          <dt className="text-[11px] font-semibold text-red-600">Overdue</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-red-700">
            {formatPHP(totals.overdue)}
          </dd>
        </div>
      </dl>

      {partners.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1160px] text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  Partner
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Earned
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Settled
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Waived
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Outstanding
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Under review
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Overdue
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Next deadline
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Last settled
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {partners.map((partner) => {
                const meta = standingMeta[partner.standing];
                return (
                  <tr key={partner.partnerId} className="align-top hover:bg-gray-50/70">
                    <td className="px-4 py-2">
                      <p className="font-semibold text-navy">
                        {partner.partnerName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {partner.partnerEmail}
                      </p>
                      {partner.partnerStatus !== "ACTIVE" && (
                        <Badge tone="neutral" className="mt-1.5">
                          {partner.partnerStatus === "DEACTIVATED"
                            ? "Deactivated"
                            : "Pending activation"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">
                      {formatPHP(partner.balance.earned)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {formatPHP(partner.balance.paid)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-primary">
                      {formatPHP(partner.balance.waived)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">
                      {formatPHP(partner.balance.amountDue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                      {formatPHP(partner.balance.pending)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-red-600">
                      {formatPHP(partner.balance.overdueAmount)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {partner.balance.nextDueAt
                        ? formatDate(partner.balance.nextDueAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {partner.lastPaidAt ? (
                        <>
                          <p>{formatDate(partner.lastPaidAt)}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {formatPHP(partner.lastPaidAmount)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ServiceFeeWaiverForm
                        partnerId={partner.partnerId}
                        partnerName={partner.partnerName}
                        amountDue={partner.balance.amountDue}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-xs text-gray-500">
          No partner accounts yet.
        </p>
      )}
    </section>
  );
}
