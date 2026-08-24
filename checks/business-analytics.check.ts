import fs from "node:fs";

import { ok, run } from "./harness";

async function main() {
  const { parseAnalyticsFilters } = await import("@/lib/analytics-query");
  const { previousAnalyticsRange } = await import(
    "@/lib/business-analytics"
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

  const migration = fs.readFileSync(
    "prisma/migrations/202608240002_business_analytics/migration.sql",
    "utf8"
  );
  ok("single-sport legacy courts are backfilled", migration.includes('cardinality(hub."games") = 1'));
  ok("schedule history starts with a Manila launch snapshot", migration.includes("Asia/Manila"));
  ok("multi-sport legacy courts remain explicitly selectable", migration.includes('ALTER TABLE "Court" ADD COLUMN "sport" TEXT'));
}

void run(main);
