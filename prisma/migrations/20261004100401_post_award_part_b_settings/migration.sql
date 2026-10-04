-- 6.13 Part B run 1a (B4, Rule 1, BD-613-102): Part B's settings on the post-award policy and the contract type's typed
-- twins (FR-MTD-012). Every column is new and nullable with no default: each ships unset, and the spec's figures are test
-- fixtures and a go-live seed, never a value written here. No row is changed.

-- CreateEnum
CREATE TYPE "LadWaiverApplication" AS ENUM ('NEXT_CERTIFICATE', 'FINAL_ACCOUNT');

-- CreateEnum
CREATE TYPE "ReleaseEvent" AS ENUM ('MAKING_GOOD', 'FINAL_PAYMENT');

-- CreateEnum
CREATE TYPE "NominationLetterForms" AS ENUM ('ONE_FORM', 'PER_LETTER');

-- CreateEnum
CREATE TYPE "LossDaysComposition" AS ENUM ('CAPPED_RETENDER_PLUS_PERIOD', 'DAYS_TO_NEW_COMPLETION');

-- CreateEnum
CREATE TYPE "FinalPreviousBasis" AS ENUM ('BEFORE_DEDUCTIONS', 'AS_PAID');

-- CreateEnum
CREATE TYPE "EotInstrumentKind" AS ENUM ('EXTENSION_OF_TIME', 'CONTRACT_PERIOD', 'BOTH');

-- CreateEnum
CREATE TYPE "CompletionVariant" AS ENUM ('STANDARD', 'IT');

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "claimsCommitteeId" TEXT,
ADD COLUMN     "completionVariant" "CompletionVariant",
ADD COLUMN     "eotInstrumentKind" "EotInstrumentKind";

-- AlterTable
ALTER TABLE "PostAwardPolicy" ADD COLUMN     "designBondPct" DECIMAL(9,4),
ADD COLUMN     "designBondProvenance" "Provenance",
ADD COLUMN     "designBondYears" INTEGER,
ADD COLUMN     "finalAccountProvenance" "Provenance",
ADD COLUMN     "finalPreviousBasis" "FinalPreviousBasis",
ADD COLUMN     "ladAntiOppressionDays" INTEGER,
ADD COLUMN     "ladAntiOppressionProvenance" "Provenance",
ADD COLUMN     "ladWaiverApplication" "LadWaiverApplication",
ADD COLUMN     "ladWaiverProvenance" "Provenance",
ADD COLUMN     "lossDaysComposition" "LossDaysComposition",
ADD COLUMN     "nominatedBondPct" DECIMAL(9,4),
ADD COLUMN     "nominatedProvenance" "Provenance",
ADD COLUMN     "nominatedQuotationCeiling" DECIMAL(18,2),
ADD COLUMN     "nominationLetterForms" "NominationLetterForms",
ADD COLUMN     "performanceBondReleaseAt" "ReleaseEvent",
ADD COLUMN     "releaseProvenance" "Provenance",
ADD COLUMN     "retenderCapDays" INTEGER,
ADD COLUMN     "retentionBalanceReleaseAt" "ReleaseEvent",
ADD COLUMN     "terminationProvenance" "Provenance",
ADD COLUMN     "weatherGuidance" TEXT,
ADD COLUMN     "weatherGuidanceProvenance" "Provenance";

-- AddForeignKey
ALTER TABLE "ContractType" ADD CONSTRAINT "ContractType_claimsCommitteeId_fkey" FOREIGN KEY ("claimsCommitteeId") REFERENCES "Committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- By hand: the ranges a setting may take once set (unset stays null).
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_lad_anti_oppression_days" CHECK ("ladAntiOppressionDays" IS NULL OR "ladAntiOppressionDays" > 0);
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_design_bond" CHECK (("designBondPct" IS NULL OR ("designBondPct" > 0 AND "designBondPct" <= 100)) AND ("designBondYears" IS NULL OR "designBondYears" > 0));
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_nominated" CHECK (("nominatedBondPct" IS NULL OR ("nominatedBondPct" > 0 AND "nominatedBondPct" <= 100)) AND ("nominatedQuotationCeiling" IS NULL OR "nominatedQuotationCeiling" > 0));
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_retender_cap_days" CHECK ("retenderCapDays" IS NULL OR "retenderCapDays" > 0);
