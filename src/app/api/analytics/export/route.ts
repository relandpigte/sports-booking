import {
  parseAnalyticsFilters,
  rawAnalyticsSelection,
} from "@/lib/analytics-query";
import {
  getBusinessAnalytics,
  ownerAnalyticsOptions,
  partnerAnalyticsOptions,
} from "@/lib/business-analytics";
import { getAuthenticatedUser } from "@/lib/dal";
import { getPartnerWorkspace } from "@/lib/staffing";
import { hasStaffAccess } from "@/lib/staffing-shared";

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: (string | number)[]) {
  return values.map(csvCell).join(",");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const audience = url.searchParams.get("audience") === "owner" ? "owner" : "partner";
  const query = Object.fromEntries(url.searchParams.entries());

  let partnerId: string | undefined;
  if (audience === "owner") {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "ADMIN") {
      return new Response("Forbidden", { status: 403 });
    }
  } else {
    const workspace = await getPartnerWorkspace();
    if (!workspace || !hasStaffAccess(workspace, "reports", "VIEW")) {
      return new Response("Forbidden", { status: 403 });
    }
    partnerId = workspace.partnerId;
  }

  const options =
    audience === "owner"
      ? await ownerAnalyticsOptions(rawAnalyticsSelection(query))
      : await partnerAnalyticsOptions(partnerId!);
  const filters = parseAnalyticsFilters({
    query,
    audience,
    options,
    partnerId,
  });
  const data = await getBusinessAnalytics({ audience, filters });
  const lines: string[] = [
    csvRow(["Bunal.club Analytics Export"]),
    csvRow(["From", filters.from]),
    csvRow(["To", filters.to]),
    "",
    csvRow(["Summary", "Value"]),
    csvRow([audience === "owner" ? "Platform GMV" : "Gross revenue", audience === "owner" ? data.kpis.gross : data.kpis.salesRevenue]),
    csvRow(["Refunds", data.kpis.refunds]),
    csvRow([audience === "owner" ? "Recipient shares" : "Net revenue", data.kpis.netRevenue]),
    csvRow(["Bunal service fees", data.kpis.serviceFees]),
    csvRow(["Transactions", data.kpis.transactions]),
    csvRow([data.kpis.estimatedUtilization ? "Estimated utilization (%)" : "Court utilization (%)", data.kpis.utilizationRate.toFixed(2)]),
    csvRow(["New customers", data.kpis.newCustomers]),
    csvRow(["30-day retention (%)", data.kpis.retentionRate.toFixed(2)]),
    "",
    csvRow(["Revenue trend", "Gross", "Refunds", "Net"]),
    ...data.trend.map((point) => csvRow([point.bucket, point.gross, point.refunds, point.net])),
    "",
    csvRow(["Court", "Hub", "Sport", "Booked hours", "Available hours", "Utilization (%)", "Estimated"]),
    ...data.utilization.map((row) => csvRow([row.court, row.hub, row.sport, row.bookedHours, row.availableHours, row.utilizationRate.toFixed(2), row.estimated ? "Yes" : "No"])),
    "",
    ...(audience === "owner"
      ? [
          csvRow(["Event", "Hub", "Date", "Transactions", "Paid spots", "Player checkout", "Venue revenue", "Gross payment fees", "PayMongo deductions", "Net Bunal revenue"]),
          ...data.events.map((row) => csvRow([row.title, row.hub, row.date, row.transactions, row.paidSpots, row.checkoutTotal, row.revenue, row.grossPaymentFees, row.processingFees, row.serviceFees])),
          "",
          csvRow(["Event payment breakdown", "Hub", "Payment reference", "Paid at", "Status", "Mode", "Spots", "Player checkout", "Venue revenue", "Gross payment fees", "PayMongo deduction", "Net Bunal revenue"]),
          ...data.events.flatMap((row) =>
            row.payments.map((payment) =>
              csvRow([row.title, row.hub, payment.reference, payment.paidAt, payment.status, payment.collectionMode, payment.spots, payment.checkoutTotal, payment.venueRevenue, payment.grossPaymentFees, payment.processingFees, payment.netBunalRevenue])
            )
          ),
        ]
      : [
          csvRow(["Event", "Hub", "Date", "Transactions", "Revenue", "Service fees"]),
          ...data.events.map((row) => csvRow([row.title, row.hub, row.date, row.transactions, row.revenue, row.serviceFees])),
        ]),
  ];
  if (audience === "owner") {
    lines.push(
      "",
      csvRow(["Trainer", "Paid sessions", "Trainer share", "Bunal fees"]),
      ...data.trainers.map((row) => csvRow([row.trainer, row.sessions, row.revenue, row.serviceFees]))
    );
  }

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bunal-${audience}-analytics-${filters.from}-to-${filters.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
