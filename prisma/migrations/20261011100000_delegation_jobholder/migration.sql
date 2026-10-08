-- Phase 3 rulings applied (product owner, 2026-10-08, decisions log line 1773, FR-APR-011): a delegation records the JOBHOLDER whose authority is delegated, apart from the
-- grantor. The grantor is the jobholder's superior and the delegate a direct line subordinate of the jobholder, and the grantor is never the jobholder (a delegation of one's own
-- authority is refused: the requirement's own acceptance test). Additive: one nullable column, its index and its foreign key. NO BACKFILL: a delegation with the column empty keeps
-- today's reading (the grantor is the holder, and the engine takes the authority from the grantor's holding), so no delegation already in force stops conferring authority.
--
-- The one CHECK refuses a row whose jobholder is its grantor. It passes on NULL by design (every existing row), and is written so that an unknown value refuses (IS TRUE) rather than
-- passes. No pre-check is needed: every existing row has the column empty, and the CHECK is true for a NULL jobholder.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   ALTER TABLE "Delegation" DROP CONSTRAINT "Delegation_grantor_is_not_jobholder"
--   ALTER TABLE "Delegation" DROP CONSTRAINT "Delegation_jobholderPersonId_fkey"
--   DROP INDEX "Delegation_jobholderPersonId_idx"
--   ALTER TABLE "Delegation" DROP COLUMN "jobholderPersonId"

-- AlterTable
ALTER TABLE "Delegation" ADD COLUMN     "jobholderPersonId" TEXT;

-- CreateIndex
CREATE INDEX "Delegation_jobholderPersonId_idx" ON "Delegation"("jobholderPersonId");

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_jobholderPersonId_fkey" FOREIGN KEY ("jobholderPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The grantor is never the jobholder.
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_grantor_is_not_jobholder" CHECK (("jobholderPersonId" IS NULL OR "jobholderPersonId" <> "fromPersonId") IS TRUE);
