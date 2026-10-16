-- Wave 3b step 17 (ADR 0036 D11, ruling 11): a SUBSTITUTION release is made by the departing officer, with their password asked again, and the act is attributed to them.
-- The slot ShareRelease.releasedBy needs a column of its own. An UNSEAL release is signed through the opening authorisation, so the column is null there.
-- It is not made NOT NULL for a SUBSTITUTION by a CHECK: the trigger tests write forged releases straight into the table to prove the trigger refuses them,
-- and the one action that writes a real release (releaseShareForSubstitution) always names the officer.

-- AlterTable
ALTER TABLE "ShareRelease" ADD COLUMN     "releasedByPersonId" TEXT;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_releasedByPersonId_fkey" FOREIGN KEY ("releasedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
