-- AlterTable
ALTER TABLE "OpenedBid" ADD COLUMN     "asReadCorrections" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OpenedBidInitial" ADD COLUMN     "correctionNo" INTEGER NOT NULL DEFAULT 0;

-- Backfill (6.7 review M-2): a bid corrected before this counter existed counts one correction,
-- and an initial recorded at or after that correction initials the corrected reading
UPDATE "OpenedBid" SET "asReadCorrections" = 1 WHERE "asReadCorrectedAt" IS NOT NULL;
UPDATE "OpenedBidInitial" i SET "correctionNo" = 1 FROM "OpenedBid" b WHERE b."id" = i."openedBidId" AND b."asReadCorrectedAt" IS NOT NULL AND i."recordedAt" >= b."asReadCorrectedAt";
