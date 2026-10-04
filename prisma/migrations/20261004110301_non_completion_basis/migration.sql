-- 6.13 Part B run 1b (613A-C2 (a)(1), (2) as approved, BD-613-89, flagged against accepted Part A): where a damages
-- decision's entitlement determination is recorded. Every existing decision was recorded on the decision itself
-- (CNC_DETERMINATION) and stays live and readable until replaced. Every later one reads the EOT record (EOT_RECORD). An
-- issued EOT certificate supersedes a decision for later certificates only, with its note.

-- Pre-check (the SELECT CAST pattern): the column is new, so no row's basis is overwritten.
SELECT CAST((SELECT 'Pre-check failed: NonCompletion already has a basis column. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'NonCompletion' AND column_name = 'basis')) AS INTEGER);

-- CreateEnum
CREATE TYPE "NonCompletionBasis" AS ENUM ('CNC_DETERMINATION', 'EOT_RECORD');

-- AlterTable: added nullable, every existing row set, then required (no DEFAULT: each new decision says its basis).
ALTER TABLE "NonCompletion" ADD COLUMN     "basis" "NonCompletionBasis",
ADD COLUMN     "eotClaimId" TEXT,
ADD COLUMN     "supersededByEotId" TEXT,
ADD COLUMN     "supersededNote" TEXT NOT NULL DEFAULT '';

UPDATE "NonCompletion" SET "basis" = 'CNC_DETERMINATION';

-- Post-check: no row is left without its basis (none lost).
SELECT CAST((SELECT 'Post-check failed: a NonCompletion row has no basis after the backfill. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "NonCompletion" WHERE "basis" IS NULL)) AS INTEGER);

ALTER TABLE "NonCompletion" ALTER COLUMN "basis" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_eotClaimId_fkey" FOREIGN KEY ("eotClaimId") REFERENCES "EotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_supersededByEotId_fkey" FOREIGN KEY ("supersededByEotId") REFERENCES "ExtensionOfTime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An excusable or pending decision on the EOT record names its claim, a Part A decision names none, and a supersession
-- carries its note (and only it).
ALTER TABLE "NonCompletion" ADD CONSTRAINT "NonCompletion_basis_shape"
  CHECK (("basis" = 'EOT_RECORD' OR "eotClaimId" IS NULL)
    AND ("basis" <> 'EOT_RECORD' OR "outcome" <> 'EXCUSED_OR_PENDING' OR "eotClaimId" IS NOT NULL)
    AND (("supersededByEotId" IS NULL) = ("supersededNote" = '')));
