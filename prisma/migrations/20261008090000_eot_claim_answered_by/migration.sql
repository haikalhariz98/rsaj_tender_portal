-- Product owner's ruling of 2026-10-07 (ADR 0034 D12): an EOT claim answered with no loss-and-expense estimate has its own person column.
--
-- The column is nullable and no row is backfilled: null on a claim answered before sign-in reads "before sign-in", which is honest. A written row would claim knowledge
-- the system does not have. The column only adds a nullable column with a foreign key to Person, so no existing row can violate it and no pre-check is needed.

-- AlterTable
ALTER TABLE "EotClaim" ADD COLUMN     "answeredByPersonId" TEXT;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_answeredByPersonId_fkey" FOREIGN KEY ("answeredByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
