-- Court-level sport powers sport filters and court comparisons. Existing
-- single-sport hubs can be assigned without ambiguity; multi-sport legacy
-- courts remain null until their partner selects the correct sport.
ALTER TABLE "Court" ADD COLUMN "sport" TEXT;

UPDATE "Court" AS court
SET "sport" = hub."games"[1]
FROM "Hub" AS hub
WHERE court."hubId" = hub."id"
  AND cardinality(hub."games") = 1;

CREATE TABLE "CourtScheduleRevision" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "operatingHours" JSONB,
    "slotRules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtScheduleRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourtScheduleRevision_courtId_effectiveFrom_key"
ON "CourtScheduleRevision"("courtId", "effectiveFrom");

CREATE INDEX "CourtScheduleRevision_courtId_effectiveFrom_effectiveTo_idx"
ON "CourtScheduleRevision"("courtId", "effectiveFrom", "effectiveTo");

ALTER TABLE "CourtScheduleRevision"
ADD CONSTRAINT "CourtScheduleRevision_courtId_fkey"
FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Establish the exact-history boundary. Dates before this snapshot have no
-- applicable revision and are therefore reported using the current schedule
-- with an explicit Estimated label.
INSERT INTO "CourtScheduleRevision" (
  "id",
  "courtId",
  "effectiveFrom",
  "operatingHours",
  "slotRules"
)
SELECT
  'csr_' || md5(court."id" || clock_timestamp()::text),
  court."id",
  to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD'),
  hub."operatingHours",
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'weekday', rule."weekday",
          'hour', rule."hour",
          'closed', rule."closed",
          'hourlyRate', rule."hourlyRate"
        ) ORDER BY rule."weekday", rule."hour"
      )
      FROM "CourtSlotRule" AS rule
      WHERE rule."courtId" = court."id"
    ),
    '[]'::jsonb
  )
FROM "Court" AS court
JOIN "Hub" AS hub ON hub."id" = court."hubId";
