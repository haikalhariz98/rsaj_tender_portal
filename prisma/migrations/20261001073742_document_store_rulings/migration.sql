-- AlterTable
ALTER TABLE "Delegation" ADD COLUMN     "recommendationTextOnlyAtLanding" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (decisions log 2026-10-01, delegation legacy). A delegation is text-only at
-- landing where its recommendation text is not blank and no HOLDER_RECOMMENDATION
-- attachment of any state (live, detached or on a withdrawn version) exists for it.
-- The application never writes this column.
UPDATE "Delegation" d
SET "recommendationTextOnlyAtLanding" = true
WHERE d."holderRecommendation" ~ '[^[:space:]]'
  AND NOT EXISTS (
    SELECT 1 FROM "DocumentAttachment" a
    WHERE a."delegationId" = d."id" AND a."purpose" = 'HOLDER_RECOMMENDATION'
  );

-- BD-DS-10 as ruled: a retention period is at least one month, and null is not set.
-- Before this ruling zero was read as not set, so a stored zero or less becomes null,
-- the same meaning, before the CHECK is added.
UPDATE "DocumentClass" SET "retentionMonths" = NULL WHERE "retentionMonths" <= 0;

ALTER TABLE "DocumentClass" ADD CONSTRAINT "DocumentClass_retention_positive"
  CHECK ("retentionMonths" IS NULL OR "retentionMonths" > 0);
