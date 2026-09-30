-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "alternateMayVoteForRecused" BOOLEAN;

-- Backfill decided matters with the committee's answer as it stands now, the closest record available
UPDATE "CommitteeDecision" d
SET "alternateMayVoteForRecused" = c."alternateMayVoteForRecused"
FROM "Meeting" m, "Committee" c
WHERE d."meetingId" = m."id" AND m."committeeId" = c."id" AND d."outcome" IN ('CARRIED', 'NOT_CARRIED');
