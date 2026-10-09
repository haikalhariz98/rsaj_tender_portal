-- A notice of non-award is one per tenderer under each award, not one per tenderer on the exercise.
-- An issued award can be cancelled and made again. The notices issued under the first award stay on record (the table is append-only) and are read as superseded, and the second award can issue its own.
-- Relaxes a constraint and adds an index. No row is changed or lost, and no existing row can violate the new key: a pair unique on (exerciseId, partyId) is unique on (awardId, partyId).
-- The append-only triggers are on rows and on TRUNCATE, so dropping and adding an index touches neither.

-- DropIndex
DROP INDEX "NonAwardNotice_exerciseId_partyId_key";

-- CreateIndex
CREATE INDEX "NonAwardNotice_exerciseId_partyId_idx" ON "NonAwardNotice"("exerciseId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "NonAwardNotice_awardId_partyId_key" ON "NonAwardNotice"("awardId", "partyId");
