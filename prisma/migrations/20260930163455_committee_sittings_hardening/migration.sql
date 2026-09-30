-- DropForeignKey
ALTER TABLE "NotApprovedOutcome" DROP CONSTRAINT "NotApprovedOutcome_committeeId_fkey";

-- AlterTable
ALTER TABLE "Committee" ADD COLUMN     "alternateMayVoteForRecused" BOOLEAN,
ADD COLUMN     "alternateMayVoteForRecusedProvenance" "Provenance";

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "notApprovedOutcomeKind" "NotApprovedKind",
ADD COLUMN     "notApprovedOutcomeNameEn" TEXT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "registerSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "timeZone" TEXT;

-- AddForeignKey
ALTER TABLE "NotApprovedOutcome" ADD CONSTRAINT "NotApprovedOutcome_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the outcome snapshot on decisions already recorded against an outcome
UPDATE "CommitteeDecision" d
SET "notApprovedOutcomeNameEn" = o."nameEn", "notApprovedOutcomeKind" = o."kind"
FROM "NotApprovedOutcome" o
WHERE d."notApprovedOutcomeId" = o."id" AND d."notApprovedOutcomeNameEn" IS NULL;
