-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "startsOn" TEXT NOT NULL,
    "endsOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "seriesId" TEXT,
ADD COLUMN "seriesPosition" INTEGER;

-- CreateIndex
CREATE INDEX "EventSeries_hubId_startsOn_idx" ON "EventSeries"("hubId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Event_seriesId_date_key" ON "Event"("seriesId", "date");

-- CreateIndex
CREATE INDEX "Event_seriesId_seriesPosition_idx" ON "Event"("seriesId", "seriesPosition");

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
