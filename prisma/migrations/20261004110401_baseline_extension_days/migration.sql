-- 6.13 Part B run 1b (ADR 0030, flagged against accepted 6.12): the days extensions of time and of the contract period
-- have added to a baseline version's date for completion (the whole works') and to each section's, so a later
-- correction that derives the date from possession and the period keeps them. No extension has been granted on any
-- contract before this migration, so every existing version reads 0: a fact, not a policy default.

-- Pre-check (the SELECT CAST pattern): the columns are new, so no recorded extension is overwritten.
SELECT CAST((SELECT 'Pre-check failed: a baseline already records extension days. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('ContractBaseline', 'ContractSection') AND column_name = 'extensionDays')) AS INTEGER);

-- AlterTable
ALTER TABLE "ContractBaseline" ADD COLUMN     "extensionDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ContractSection" ADD COLUMN     "extensionDays" INTEGER NOT NULL DEFAULT 0;

-- Never below nothing: an extension only adds days.
ALTER TABLE "ContractBaseline" ADD CONSTRAINT "ContractBaseline_extension_days" CHECK ("extensionDays" >= 0);
ALTER TABLE "ContractSection" ADD CONSTRAINT "ContractSection_extension_days" CHECK ("extensionDays" >= 0);
