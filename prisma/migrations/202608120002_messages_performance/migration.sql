-- Access to Messages is checked against live booking and registration state on
-- every request. These indexes keep those authorization lookups bounded as
-- booking and event history grows.
CREATE INDEX "Booking_userId_status_endsAt_idx"
ON "Booking"("userId", "status", "endsAt");

CREATE INDEX "Booking_hubId_userId_status_endsAt_idx"
ON "Booking"("hubId", "userId", "status", "endsAt");

CREATE INDEX "Event_hubId_status_endsAt_idx"
ON "Event"("hubId", "status", "endsAt");

CREATE INDEX "EventRegistration_userId_status_eventId_idx"
ON "EventRegistration"("userId", "status", "eventId");
