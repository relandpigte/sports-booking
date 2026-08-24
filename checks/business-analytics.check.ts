import fs from "node:fs";

import { ok, run } from "./harness";

async function main() {
  const {
    parseAnalyticsFilters,
    parseAnalyticsUtilizationView,
  } = await import("@/lib/analytics-query");
  const { previousAnalyticsRange } = await import(
    "@/lib/business-analytics"
  );
  const { hubUtilizationPage } = await import(
    "@/lib/analytics-utilization"
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

  const optionRoute = fs.readFileSync(
    "src/app/api/analytics/options/route.ts",
    "utf8"
  );
  ok("analytics option search is admin-only", optionRoute.includes('user.role !== "ADMIN"'));
  ok("analytics option search has a bounded result window", optionRoute.includes("limit: 20"));

  const migration = fs.readFileSync(
    "prisma/migrations/202608240002_business_analytics/migration.sql",
    "utf8"
  );
  ok("single-sport legacy courts are backfilled", migration.includes('cardinality(hub."games") = 1'));
  ok("schedule history starts with a Manila launch snapshot", migration.includes("Asia/Manila"));
  ok("multi-sport legacy courts remain explicitly selectable", migration.includes('ALTER TABLE "Court" ADD COLUMN "sport" TEXT'));
}

void run(main);
