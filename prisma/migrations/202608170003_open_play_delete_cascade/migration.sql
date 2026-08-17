ALTER TABLE "OpenPlayGamePlayer" DROP CONSTRAINT "OpenPlayGamePlayer_participantId_fkey";
ALTER TABLE "OpenPlayGamePlayer" ADD CONSTRAINT "OpenPlayGamePlayer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "OpenPlayParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
