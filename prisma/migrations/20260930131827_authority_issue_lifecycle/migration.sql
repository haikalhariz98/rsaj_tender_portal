-- AlterTable
ALTER TABLE "AuthorityMatrix" ADD COLUMN     "issuedAt" TIMESTAMP(3);

-- Every issue that existed before drafts did was in use as issued. Backfilled so the
-- matrix in force today stays in force; without this every issue becomes a draft and
-- routing finds nothing.
UPDATE "AuthorityMatrix" SET "issuedAt" = "effectiveFrom" WHERE "issuedAt" IS NULL;
