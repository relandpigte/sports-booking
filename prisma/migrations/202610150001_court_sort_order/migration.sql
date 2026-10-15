-- AlterTable
ALTER TABLE "Court" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve the order every hub shows today (creation order).
UPDATE "Court" AS c
SET "sortOrder" = ranked.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "hubId" ORDER BY "createdAt", "id") - 1 AS position
  FROM "Court"
) AS ranked
WHERE c."id" = ranked."id";
