import fs from "node:fs";

import { ok, run } from "./harness";

async function main() {
  const {
    parseAnalyticsBookingFeeView,
    parseAnalyticsEventView,
    parseAnalyticsFilters,
    parseAnalyticsUtilizationView,
  } = await import("@/lib/analytics-query");
  const { previousAnalyticsRange } = await import(
    "@/lib/business-analytics"
  );
  const { hubUtilizationPage } = await import(
    "@/lib/analytics-utilization"
  );
  const { courtPaymentFeePage } = await import(
    "@/lib/analytics-booking-fees"
  );
  const { eventPerformancePage } = await import(
    "@/lib/analytics-events"
  );
  const options = {
    partners: [
      { id: "partner-1", name: "Partner One" },
      { id: "partner-2", name: "Partner Two" },
    ],
    hubs: [
      { id: "hub-1", name: "Hub One", partnerId: "partner-1" },
      { id: "hub-2", name: "Hub Two", partnerId: "partner-2" },
    ],
    courts: [
      { id: "court-1", name: "Court One", hubId: "hub-1", sport: "pickleball" },
    ],
    sports: ["pickleball", "tennis"],
  };

  const partner = parseAnalyticsFilters({
    query: {
      from: "2025-01-01",
      to: "2026-08-25",
      source: "trainer",
      hub: "hub-2",
      court: "unknown",
      sport: "invented",
      compare: "0",
    },
    audience: "partner",
    options,
    partnerId: "partner-1",
  });
  ok("partner scope is enforced", partner.partnerId === "partner-1");
  ok("another partner's hub is rejected", partner.hubId === undefined);
  ok("unknown courts are rejected", partner.courtId === undefined);
  ok("unknown sports are rejected", partner.sport === undefined);
  ok("trainer source is owner-only", partner.source === "all");
  ok("comparison can be disabled", partner.compare === false);
  ok("custom ranges are capped at 366 days", partner.from === "2025-08-25");

  const reversed = parseAnalyticsFilters({
    query: { from: "2026-08-20", to: "2026-08-10" },
    audience: "owner",
    options,
  });
  ok("reversed date inputs are normalized", reversed.from === "2026-08-10" && reversed.to === "2026-08-20");
  ok("prior period has matching inclusive length", JSON.stringify(previousAnalyticsRange("2026-08-10", "2026-08-20")) === JSON.stringify({ from: "2026-07-30", to: "2026-08-09" }));

  const utilizationView = parseAnalyticsUtilizationView({
    utilizationPage: "2",
    utilizationQuery: "  Metro  ",
    utilizationSort: "booked-desc",
    utilizationHub: "hub-2",
  });
  ok("utilization view validates search, sorting, and drill-down state", JSON.stringify(utilizationView) === JSON.stringify({ page: 2, query: "Metro", sort: "booked-desc", expandedHubId: "hub-2" }));

  const utilizationRows = Array.from({ length: 26 }, (_, index) => ({
    courtId: `court-${index}`,
    court: `Court ${index}`,
    hubId: `hub-${index}`,
    hub: `Hub ${String(index).padStart(2, "0")}`,
    partnerId: `partner-${index}`,
    partner: `Partner ${index}`,
    sport: "pickleball",
    bookedHours: index,
    availableHours: 100,
    utilizationRate: index,
    estimated: false,
  }));
  utilizationRows.push({
    ...utilizationRows[25],
    courtId: "court-25-b",
    court: "Court 25 B",
    bookedHours: 25,
  });
  const utilizationPage = hubUtilizationPage(utilizationRows, {
    page: 2,
    query: "",
    sort: "name-asc",
  });
  ok("admin utilization is paginated to 25 hubs", utilizationPage.pageSize === 25 && utilizationPage.page === 2 && utilizationPage.items.length === 1 && utilizationPage.total === 26);
  ok("hub utilization groups court details with weighted totals", utilizationPage.items[0]?.courtCount === 2 && utilizationPage.items[0]?.bookedHours === 50 && utilizationPage.items[0]?.availableHours === 200 && utilizationPage.items[0]?.utilizationRate === 25);

  const bookingFeeView = parseAnalyticsBookingFeeView(
    {
      bookingFeePage: "2",
      bookingFeeQuery: "  Metro  ",
      bookingFeeFrom: "2026-08-01",
      bookingFeeTo: "2026-08-20",
    },
    { from: "2026-08-01", to: "2026-08-31" }
  );
  ok(
    "booking fee view validates pagination, search, and dates",
    JSON.stringify(bookingFeeView) ===
      JSON.stringify({
        page: 2,
        query: "Metro",
        from: "2026-08-01",
        to: "2026-08-20",
      })
  );

  const courtPayments = Array.from({ length: 11 }, (_, index) => ({
    paymentId: `payment-${index}`,
    reference: `reference-${index}`,
    partner: index === 10 ? "Metro Sports" : "Partner One",
    hub: index === 10 ? "Metro Hub" : "North Hub",
    paidAt: `2026-08-${String(index + 1).padStart(2, "0")}T04:00:00.000Z`,
    status: "SUCCEEDED" as const,
    collectionMode: "AUTOMATIC" as const,
    checkoutTotal: 1_050,
    venueRevenue: 1_000,
    grossPaymentFees: 50,
    processingFees: 20,
    netBunalRevenue: 30,
    bookings: [
      {
        bookingId: `booking-${index}`,
        court: index === 10 ? "Metro Court" : "Court One",
        date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        startHour: 8,
        endHour: 9,
        venueRevenue: 1_000,
      },
    ],
  }));
  const secondPaymentPage = courtPaymentFeePage(courtPayments, {
    page: 2,
    query: "",
    from: "2026-08-01",
    to: "2026-08-31",
  });
  ok(
    "court fee payments default to ten rows per page",
    secondPaymentPage.pageSize === 10 &&
      secondPaymentPage.page === 2 &&
      secondPaymentPage.items.length === 1 &&
      secondPaymentPage.total === 11
  );
  const searchedPayments = courtPaymentFeePage(courtPayments, {
    page: 1,
    query: "metro",
    from: "2026-08-01",
    to: "2026-08-31",
  });
  ok(
    "court fee search covers partner, hub, and court names",
    searchedPayments.total === 1 &&
      searchedPayments.items[0]?.paymentId === "payment-10"
  );
  const datedPayments = courtPaymentFeePage(courtPayments, {
    page: 1,
    query: "",
    from: "2026-08-05",
    to: "2026-08-07",
  });
  ok(
    "court fee date filters use the Manila payment date",
    datedPayments.total === 3
  );

  const eventView = parseAnalyticsEventView(
    {
      eventPage: "2",
      eventQuery: "  Metro  ",
      eventFrom: "2026-08-01",
      eventTo: "2026-08-20",
    },
    { from: "2026-08-01", to: "2026-08-31" }
  );
  ok(
    "event view validates pagination, search, and dates",
    JSON.stringify(eventView) ===
      JSON.stringify({
        page: 2,
        query: "Metro",
        from: "2026-08-01",
        to: "2026-08-20",
      })
  );
  const events = Array.from({ length: 11 }, (_, index) => ({
    eventId: `event-${index}`,
    title: index === 10 ? "Metro Open Play" : `Open Play ${index}`,
    hub: index === 10 ? "Metro Hub" : "North Hub",
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    paidSpots: 1,
    checkoutTotal: 105,
    revenue: 100,
    grossPaymentFees: 5,
    processingFees: 2,
    serviceFees: 3,
    transactions: 1,
    payments: [
      {
        paymentId: `event-payment-${index}`,
        reference: index === 10 ? "metro-reference" : `reference-${index}`,
        paidAt: `2026-08-${String(index + 1).padStart(2, "0")}T04:00:00.000Z`,
        status: "SUCCEEDED" as const,
        collectionMode: "AUTOMATIC" as const,
        spots: 1,
        checkoutTotal: 105,
        venueRevenue: 100,
        grossPaymentFees: 5,
        processingFees: 2,
        netBunalRevenue: 3,
      },
    ],
  }));
  const secondEventPage = eventPerformancePage(events, {
    page: 2,
    query: "",
    from: "2026-08-01",
    to: "2026-08-31",
  });
  ok(
    "event revenue defaults to ten rows per page",
    secondEventPage.pageSize === 10 &&
      secondEventPage.page === 2 &&
      secondEventPage.items.length === 1 &&
      secondEventPage.total === 11
  );
  const searchedEvents = eventPerformancePage(events, {
    page: 1,
    query: "metro",
    from: "2026-08-01",
    to: "2026-08-31",
  });
  ok(
    "event revenue search covers events, hubs, and payment references",
    searchedEvents.total === 1 &&
      searchedEvents.items[0]?.eventId === "event-10"
  );
  const datedEvents = eventPerformancePage(events, {
    page: 1,
    query: "",
    from: "2026-08-05",
    to: "2026-08-07",
  });
  ok("event revenue filters by event date", datedEvents.total === 3);

  const optionRoute = fs.readFileSync(
    "src/app/api/analytics/options/route.ts",
    "utf8"
  );
  ok("analytics option search is admin-only", optionRoute.includes('user.role !== "ADMIN"'));
  ok("analytics option search has a bounded result window", optionRoute.includes("limit: 20"));

  const bookingFeeBreakdown = fs.readFileSync(
    "src/components/reports/CourtPaymentFeeBreakdown.tsx",
    "utf8"
  );
  ok(
    "booking fee filters update without reloading the report page",
    bookingFeeBreakdown.startsWith('"use client";') &&
      bookingFeeBreakdown.includes("window.history.replaceState") &&
      !bookingFeeBreakdown.includes("<form")
  );
  const eventFinancialPerformance = fs.readFileSync(
    "src/components/reports/EventFinancialPerformance.tsx",
    "utf8"
  );
  ok(
    "event revenue filters update without reloading the report page",
    eventFinancialPerformance.startsWith('"use client";') &&
      eventFinancialPerformance.includes("window.history.replaceState") &&
      !eventFinancialPerformance.includes("<form")
  );

  const migration = fs.readFileSync(
    "prisma/migrations/202608240002_business_analytics/migration.sql",
    "utf8"
  );
  ok("single-sport legacy courts are backfilled", migration.includes('cardinality(hub."games") = 1'));
  ok("schedule history starts with a Manila launch snapshot", migration.includes("Asia/Manila"));
  ok("multi-sport legacy courts remain explicitly selectable", migration.includes('ALTER TABLE "Court" ADD COLUMN "sport" TEXT'));
}

void run(main);
