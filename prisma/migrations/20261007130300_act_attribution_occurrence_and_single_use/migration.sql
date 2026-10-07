-- Phase 2a review (ADR 0034 D12): three corrections to ActAttribution, one migration.
--
-- 1. A slot that an act writes again (a returned variation decided again, a conflict declared twice on one step) was one row per
--    (entity, entityId, slot) in an append-only table, so the second write could be neither made nor replaced. Each write is now a
--    new occurrence, numbered from 1: the earlier rows stay as the evidence of who acted before, and the highest is the one in force.
-- 2. One password entry signs one act: a signature-class row keeps the session and the stamp the step-up gave it, and no two rows share
--    them. Rows that keep no stamp hold a null, and a null is never equal to another.
-- 3. An act recorded on someone's behalf is recorded for another person. A person recording their own act that way would skip the password a
--    signature asks.
--
-- The table is append-only (the previous migration), so nothing here updates a row: adding the column with a default and swapping the
-- unique index fire no row trigger, and every existing row is occurrence 1, which the old unique index guarantees is unique.

-- DropIndex
DROP INDEX "ActAttribution_entity_entityId_slot_key";

-- AlterTable
ALTER TABLE "ActAttribution" ADD COLUMN     "occurrence" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "ActAttribution_entity_entityId_slot_occurrence_key" ON "ActAttribution"("entity", "entityId", "slot", "occurrence");

-- Hand-appended. Pre-check (the SELECT CAST pattern): the unique index below holds only if no two existing rows share a session and a stamp.
-- Nothing is changed if two do.
SELECT CAST((SELECT 'Pre-check failed: two attributions already share a session and a step-up time. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ActAttribution" WHERE "stepUpAt" IS NOT NULL GROUP BY "sessionId", "stepUpAt" HAVING count(*) > 1)) AS INTEGER);

-- CreateIndex
CREATE UNIQUE INDEX "ActAttribution_sessionId_stepUpAt_key" ON "ActAttribution"("sessionId", "stepUpAt");

-- Hand-appended. Pre-check: the CHECK below holds for every existing row only if none was recorded on its own behalf.
SELECT CAST((SELECT 'Pre-check failed: an attribution was recorded on behalf of the person who recorded it. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ActAttribution" WHERE "mode" = 'RECORDED_ON_BEHALF' AND ("recordedByPersonId" = "subjectPersonId" OR "recordedBySupplierAccountId" = "subjectSupplierAccountId"))) AS INTEGER);

-- Written so that an unknown (NULL) refuses rather than passes, as the table's other CHECKs are.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_occurrence_from_one" CHECK ("occurrence" >= 1);
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_on_behalf_is_for_another" CHECK (COALESCE("mode" <> 'RECORDED_ON_BEHALF' OR (NOT COALESCE("recordedByPersonId" = "subjectPersonId", false) AND NOT COALESCE("recordedBySupplierAccountId" = "subjectSupplierAccountId", false)), false));
