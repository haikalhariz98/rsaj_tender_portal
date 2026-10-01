-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "dlpDiffersReason" TEXT,
ADD COLUMN     "ladDiffersReason" TEXT,
ADD COLUMN     "regulatedDiffersReason" TEXT;

-- Hand-written backstop: a stored reason is never blank
ALTER TABLE "Award" ADD CONSTRAINT "Award_appendix_reasons_not_blank" CHECK (("ladDiffersReason" IS NULL OR btrim("ladDiffersReason") <> '') AND ("dlpDiffersReason" IS NULL OR btrim("dlpDiffersReason") <> '') AND ("regulatedDiffersReason" IS NULL OR btrim("regulatedDiffersReason") <> ''));
