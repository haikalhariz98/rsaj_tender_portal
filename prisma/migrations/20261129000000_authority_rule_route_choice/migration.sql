-- RSAJ answers stage 2, B2 (decision D2, RSAJ answer 16, founder ruling "make it configurable"): a route choice.
-- Rows of one matter that carry an option are alternative readings of the governing documents. The customer picks one
-- on a draft, audited. Null chosen means the choice is not made, and a matter it would route refuses, saying so.

-- AlterTable
ALTER TABLE "AuthorityRule" ADD COLUMN     "choiceOptionEn" TEXT,
ADD COLUMN     "chosen" BOOLEAN;

-- A row that is no option is never chosen or passed over.
ALTER TABLE "AuthorityRule" ADD CONSTRAINT "AuthorityRule_chosen_needs_option" CHECK ("chosen" IS NULL OR "choiceOptionEn" IS NOT NULL);
