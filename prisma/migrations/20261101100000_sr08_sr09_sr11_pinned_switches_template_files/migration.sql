-- Sourcing Requirements v2, step 2b: SR-08 (ruling 12), SR-09 (ruling 13), SR-11 (ruling 14). ADR 0035.
--
-- SR-08 and SR-09: whether the specification panel and the on-screen bill of quantities are used is the customer's policy
-- (ScopePolicy, two-person path, neither ships set) and is pinned on each exercise when it is created (ruling G1). The exercise's
-- columns are nullable with no default, so an exercise made while the setting is unset pins "not set". Every exercise that exists
-- now is backfilled to its present behaviour, both used, so nothing already in flight changes its gates.
--
-- SR-11: a configured tender-document part may carry a template file, a version in the document store.
--
-- SR-09: a scope matter may be keyed to the version of the uploaded bill file instead of a bill version. It names the exercise too
-- (not exerciseId, which marks an exercise matter such as the appointment).

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "scopeExerciseId" TEXT,
ADD COLUMN     "scopeFileVersionId" TEXT;

-- AlterTable
ALTER TABLE "ScopePolicy" ADD COLUMN     "onScreenBillUsed" BOOLEAN,
ADD COLUMN     "specPanelUsed" BOOLEAN;

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "onScreenBillUsed" BOOLEAN,
ADD COLUMN     "specPanelUsed" BOOLEAN;

-- Backfill (G1): an exercise that exists keeps its present behaviour.
UPDATE "SourcingExercise" SET "specPanelUsed" = true, "onScreenBillUsed" = true;

-- AlterTable
ALTER TABLE "TenderDocumentPart" ADD COLUMN     "templateFileVersionId" TEXT;

-- CreateIndex
CREATE INDEX "CommitteeDecision_scopeFileVersionId_idx" ON "CommitteeDecision"("scopeFileVersionId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_scopeExerciseId_idx" ON "CommitteeDecision"("scopeExerciseId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_scopeFileVersionId_fkey" FOREIGN KEY ("scopeFileVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_scopeExerciseId_fkey" FOREIGN KEY ("scopeExerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDocumentPart" ADD CONSTRAINT "TenderDocumentPart_templateFileVersionId_fkey" FOREIGN KEY ("templateFileVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: a matter keyed to a bill file is a SCOPE matter, names its exercise with the file, and is never also keyed to a bill version.
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_scope_file_matter"
  CHECK (("scopeFileVersionId" IS NULL) = ("scopeExerciseId" IS NULL) AND ("scopeFileVersionId" IS NULL OR ("matterKind" = 'SCOPE' AND "bqVersionId" IS NULL)));
