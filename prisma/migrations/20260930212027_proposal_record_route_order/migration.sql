-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "proposalRecord" JSONB;

-- Backfill: existing routes are ordered by the day they were opened, not by this migration's time
UPDATE "ApprovalInstance" SET "createdAt" = "openedAt";
