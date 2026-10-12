-- Ruling 17a: a restricted tender sold online is evidenced from the supplier register.
-- A renewal lodged and not yet verified reads NOT_ASSESSED on the opened bid, and the register reading is frozen beside the finding.

-- AlterEnum
ALTER TYPE "RestrictionFinding" ADD VALUE 'NOT_ASSESSED';

-- AlterTable
ALTER TABLE "OpenedBid" ADD COLUMN     "restrictionReading" JSONB;
