-- Code review of close-out stage B, ruling 3 (P11): a line reported during the defects liability period records the day it was observed,
-- restoring ADR 0047 D1's "during the DLP". The column is nullable because a defect line is never updated (trigger DefectItem_guard), so
-- lines reported before it read "Not recorded". The CHECK holds the day to LIABILITY_PERIOD lines.

-- AlterTable
ALTER TABLE "DefectItem" ADD COLUMN     "observedOn" TIMESTAMP(3);

-- by hand: CHECK
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_observed_on" CHECK ("observedOn" IS NULL OR "source" = 'LIABILITY_PERIOD');
