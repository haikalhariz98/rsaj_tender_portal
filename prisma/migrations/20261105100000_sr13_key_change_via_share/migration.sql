-- Wave 3b stage B review: a published key change made by an officer setting their share again is read back to that officer's signed act.
-- setOfficerShare asks the password once, and that one entry signs the share (OfficerExerciseKey.person). The change row it makes cannot carry a second signature
-- (one step-up signs one act), so it names the share instead. Null for a change made through rekeyExercise, which signs PublishedKeyChange.by itself.
-- The table is append-only and the column is written at the insert, so no trigger changes.

-- AlterTable
ALTER TABLE "PublishedKeyChange" ADD COLUMN     "viaOfficerKeyId" TEXT;

-- AddForeignKey
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_viaOfficerKeyId_fkey" FOREIGN KEY ("viaOfficerKeyId") REFERENCES "OfficerExerciseKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
