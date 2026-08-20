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
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Partner fee status
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Current and no-balance partners are not due. Due-soon balances are
            still within their deadline; overdue balances receive a three-day
            enforcement grace before paid bookings pause.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Deadlines use Asia/Manila time
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 p-4">
          <dt className="text-xs text-gray-500">Partners</dt>
          <dd className="mt-1 text-xl font-bold text-gray-900">
            {partners.length}
          </dd>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <dt className="text-xs text-gray-500">Outstanding</dt>
          <dd className="mt-1 text-xl font-bold text-gray-900">
            {formatPHP(totals.outstanding)}
          </dd>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <dt className="text-xs text-amber-700">Under review</dt>
          <dd className="mt-1 text-xl font-bold text-amber-900">
            {formatPHP(totals.pending)}
          </dd>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary-soft p-4">
          <dt className="text-xs text-primary">Waived</dt>
          <dd className="mt-1 text-xl font-bold text-navy">
            {formatPHP(totals.waived)}
          </dd>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <dt className="text-xs text-red-600">Overdue</dt>
          <dd className="mt-1 text-xl font-bold text-red-700">
            {formatPHP(totals.overdue)}
          </dd>
        </div>
      </dl>

      {partners.length ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200">
          <table className="min-w-[1240px] w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Partner
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Earned
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Settled
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Waived
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Outstanding
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Under review
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Overdue
                </th>
                <th scope="col" className="px-4 py-3">
                  Next deadline
                </th>
                <th scope="col" className="px-4 py-3">
                  Last settled
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {partners.map((partner) => {
                const meta = standingMeta[partner.standing];
                return (
                  <tr key={partner.partnerId} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {partner.partnerName}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
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
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatPHP(partner.balance.earned)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatPHP(partner.balance.paid)}
                    </td>
                    <td className="px-4 py-3 text-right text-primary">
                      {formatPHP(partner.balance.waived)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatPHP(partner.balance.amountDue)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-700">
                      {formatPHP(partner.balance.pending)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
                      {formatPHP(partner.balance.overdueAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {partner.balance.nextDueAt
                        ? formatDate(partner.balance.nextDueAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
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
                    <td className="px-4 py-3 text-right">
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
        <p className="mt-4 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No partner accounts yet.
        </p>
      )}
    </section>
  );
}
