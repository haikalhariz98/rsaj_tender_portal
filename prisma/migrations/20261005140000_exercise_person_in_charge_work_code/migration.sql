-- Founder, 2026-10-05: the exercise names its person in charge and records its work code.
-- Both are optional. A person removed from the register leaves the exercise unnamed (SET NULL).
-- The work code is free text: null when not recorded, never blank, at most 100 characters.

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "personInChargeId" TEXT,
ADD COLUMN     "workCode" TEXT;

-- The work code is trimmed by the application before it is stored. Blank is held as null.
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_workCode_check"
  CHECK ("workCode" IS NULL OR (char_length("workCode") BETWEEN 1 AND 100 AND "workCode" = btrim("workCode")));

-- CreateIndex
CREATE INDEX "SourcingExercise_personInChargeId_idx" ON "SourcingExercise"("personInChargeId");

-- AddForeignKey
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_personInChargeId_fkey" FOREIGN KEY ("personInChargeId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
