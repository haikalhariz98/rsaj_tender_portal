-- CreateEnum
CREATE TYPE "PackKind" AS ENUM ('TENDER', 'QUOTATION', 'NONE');

-- CreateEnum
CREATE TYPE "PartRole" AS ENUM ('INVITATION', 'INSTRUCTIONS', 'FORM_OF_TENDER', 'CONDITIONS', 'APPENDIX', 'LOA_SPECIMEN', 'BOND_FORMS', 'SPECIFICATION', 'BILL_OF_QUANTITIES', 'SUMMARY_AND_RATES', 'REGISTRATION_BACKGROUND', 'DECLARATION', 'DRAWINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "PartContent" AS ENUM ('STANDARD', 'BESPOKE', 'MIXED');

-- CreateEnum
CREATE TYPE "PartSource" AS ENUM ('TEMPLATE', 'BQ_UNPRICED', 'APPENDIX', 'UPLOAD');

-- CreateEnum
CREATE TYPE "TenderPackStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED', 'VOID');

-- CreateEnum
CREATE TYPE "PackPartState" AS ENUM ('NOT_STARTED', 'READY', 'OMITTED');

-- CreateEnum
CREATE TYPE "AppendixStatus" AS ENUM ('DRAFT', 'COMPLETE');

-- CreateEnum
CREATE TYPE "LadKind" AS ENUM ('AMOUNT_PER_DAY', 'PERCENT_OF_SUM_PER_DAY');

-- CreateEnum
CREATE TYPE "UpliftKind" AS ENUM ('AMOUNT', 'PERCENT');

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "tenderPackPartId" TEXT;

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "approvedForTenderingAt" TIMESTAMP(3),
ADD COLUMN     "closingAt" TIMESTAMP(3),
ADD COLUMN     "packKindSnapshot" "PackKind",
ADD COLUMN     "tenderingStartOn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "documentPackKind" "PackKind",
ADD COLUMN     "documentPackKindProvenance" "Provenance";

-- CreateTable
CREATE TABLE "TenderDocumentPart" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "packKind" "PackKind" NOT NULL,
    "contractBasisCode" TEXT,
    "printedNumber" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "role" "PartRole" NOT NULL,
    "content" "PartContent" NOT NULL,
    "source" "PartSource" NOT NULL,
    "mandatory" BOOLEAN,
    "inTableDocument" BOOLEAN,
    "ownerOrgUnitCode" TEXT,
    "templateCode" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "TenderDocumentPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderDocumentPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "restrictionStampTextEn" TEXT,
    "restrictionStampTextMs" TEXT,
    "assuranceRequired" BOOLEAN,
    "ladDailyPct" DECIMAL(9,6),
    "ladDailyPctProvenance" "Provenance",
    "firstCertificateFloor" DECIMAL(18,2),
    "firstCertificatePct" DECIMAL(9,4),
    "firstCertificateProvenance" "Provenance",
    "insuranceExtraMonths" INTEGER,
    "insuranceExtraDays" INTEGER,
    "insuranceExtraProvenance" "Provenance",
    "dbInsuranceExtraMonths" INTEGER,
    "dbInsuranceExtraDays" INTEGER,
    "dbInsuranceExtraProvenance" "Provenance",
    "regulatorPermitTaxonomyCode" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TenderDocumentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderPack" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" "TenderPackStatus" NOT NULL DEFAULT 'DRAFT',
    "packKind" "PackKind" NOT NULL,
    "contractBasisCode" TEXT NOT NULL,
    "compositionSnapshot" JSONB NOT NULL,
    "formLabelSnapshot" TEXT,
    "bqVersionId" TEXT,
    "proposedStartOn" TIMESTAMP(3),
    "proposedClosingAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "manifest" JSONB,
    "faultsSnapshot" JSONB,
    "approvalInstanceId" TEXT,
    "returnedReason" TEXT NOT NULL DEFAULT '',
    "returnedAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',
    "approvedStartOn" TIMESTAMP(3),
    "approvedClosingAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "copiedFromPackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderPackPart" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "printedNumber" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "labelSnapshot" TEXT NOT NULL,
    "labelMsSnapshot" TEXT,
    "role" "PartRole" NOT NULL,
    "content" "PartContent" NOT NULL,
    "source" "PartSource" NOT NULL,
    "mandatory" BOOLEAN,
    "inTableDocument" BOOLEAN,
    "ownerOrgUnitCode" TEXT,
    "templateCode" TEXT,
    "templateId" TEXT,
    "state" "PackPartState" NOT NULL DEFAULT 'NOT_STARTED',
    "omittedReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TenderPackPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderPackDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "source" "PartSource" NOT NULL,
    "templateId" TEXT,
    "templateCode" TEXT,
    "templateName" TEXT,
    "templateFormCode" TEXT NOT NULL DEFAULT '',
    "templateRevisionDate" TIMESTAMP(3),
    "templateBodyVersion" INTEGER,
    "language" "DocumentLanguage" NOT NULL,
    "fields" JSONB NOT NULL,
    "renderedText" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderPackDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionsAppendix" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" "AppendixStatus" NOT NULL DEFAULT 'DRAFT',
    "ladOfficerRoleCode" TEXT,
    "ladOfficerLabel" TEXT,
    "eotOfficerRoleCode" TEXT,
    "eotOfficerLabel" TEXT,
    "terminationOfficerRoleCode" TEXT,
    "terminationOfficerLabel" TEXT,
    "warRiskOfficerRoleCode" TEXT,
    "warRiskOfficerLabel" TEXT,
    "arbitrationOfficerRoleCode" TEXT,
    "arbitrationOfficerLabel" TEXT,
    "pcSumWorksApply" BOOLEAN,
    "pcSumWorksText" TEXT NOT NULL DEFAULT '',
    "tplMinimum" DECIMAL(18,2),
    "wcMinimum" DECIMAL(18,2),
    "worksInsuranceUpliftKind" "UpliftKind",
    "worksInsuranceUpliftAmount" DECIMAL(18,2),
    "worksInsuranceUpliftPct" DECIMAL(9,4),
    "insuranceExcess" DECIMAL(18,2),
    "ladKind" "LadKind",
    "ladAmount" DECIMAL(18,2),
    "ladPct" DECIMAL(9,6),
    "sectionalCompletion" BOOLEAN,
    "dlpApplies" BOOLEAN,
    "dlpMonths" INTEGER,
    "firstInterimMinimum" DECIMAL(18,2),
    "subsequentInterimMinimum" DECIMAL(18,2),
    "honourCertificateDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConditionsAppendix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppendixVariationLimit" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "appendixId" TEXT NOT NULL,
    "roleCode" TEXT,
    "committeeCode" TEXT,
    "label" TEXT NOT NULL,
    "limit" DECIMAL(18,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppendixVariationLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppendixSection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "appendixId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ladKind" "LadKind",
    "ladAmount" DECIMAL(18,2),
    "ladPct" DECIMAL(9,6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppendixSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenderDocumentPart_organisationId_packKind_idx" ON "TenderDocumentPart"("organisationId", "packKind");

-- CreateIndex
CREATE UNIQUE INDEX "TenderDocumentPart_organisationId_code_key" ON "TenderDocumentPart"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TenderDocumentPolicy_organisationId_key" ON "TenderDocumentPolicy"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderPack_approvalInstanceId_key" ON "TenderPack"("approvalInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderPack_copiedFromPackId_key" ON "TenderPack"("copiedFromPackId");

-- CreateIndex
CREATE INDEX "TenderPack_organisationId_status_idx" ON "TenderPack"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenderPack_exerciseId_versionNo_key" ON "TenderPack"("exerciseId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "TenderPackPart_packId_partCode_key" ON "TenderPackPart"("packId", "partCode");

-- CreateIndex
CREATE UNIQUE INDEX "TenderPackDocument_packId_partCode_language_key" ON "TenderPackDocument"("packId", "partCode", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionsAppendix_packId_key" ON "ConditionsAppendix"("packId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_tenderPackPartId_idx" ON "DocumentAttachment"("tenderPackPartId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_tenderPackPartId_fkey" FOREIGN KEY ("tenderPackPartId") REFERENCES "TenderPackPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDocumentPart" ADD CONSTRAINT "TenderDocumentPart_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDocumentPolicy" ADD CONSTRAINT "TenderDocumentPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_bqVersionId_fkey" FOREIGN KEY ("bqVersionId") REFERENCES "BqVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_copiedFromPackId_fkey" FOREIGN KEY ("copiedFromPackId") REFERENCES "TenderPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPackPart" ADD CONSTRAINT "TenderPackPart_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPackPart" ADD CONSTRAINT "TenderPackPart_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TenderPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPackPart" ADD CONSTRAINT "TenderPackPart_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPackDocument" ADD CONSTRAINT "TenderPackDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPackDocument" ADD CONSTRAINT "TenderPackDocument_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TenderPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderPackDocument" ADD CONSTRAINT "TenderPackDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionsAppendix" ADD CONSTRAINT "ConditionsAppendix_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionsAppendix" ADD CONSTRAINT "ConditionsAppendix_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TenderPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppendixVariationLimit" ADD CONSTRAINT "AppendixVariationLimit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppendixVariationLimit" ADD CONSTRAINT "AppendixVariationLimit_appendixId_fkey" FOREIGN KEY ("appendixId") REFERENCES "ConditionsAppendix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppendixSection" ADD CONSTRAINT "AppendixSection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppendixSection" ADD CONSTRAINT "AppendixSection_appendixId_fkey" FOREIGN KEY ("appendixId") REFERENCES "ConditionsAppendix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the tender
-- pack part added for a part's uploaded file (6.4). Prisma does not model CHECK constraints, so
-- they live here, in attachFault, and in the schema-vs-CHECK test
-- (src/lib/documents/owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- At most one live pack (a draft or one with approval) per exercise: a backstop behind the
-- rule the pack actions judge under the exercise's lock.
CREATE UNIQUE INDEX "TenderPack_one_live_per_exercise" ON "TenderPack"("exerciseId") WHERE "status" IN ('DRAFT', 'SUBMITTED');

ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_version_positive" CHECK ("versionNo" >= 1);
-- A pack that went for approval was frozen when it went.
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_frozen_when_submitted"
  CHECK ("status" NOT IN ('SUBMITTED', 'APPROVED', 'RETURNED') OR ("frozenAt" IS NOT NULL AND "submittedAt" IS NOT NULL));
-- X-2: an approved pack holds the start and closing its approving step recorded.
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_approved_dates"
  CHECK ("status" <> 'APPROVED' OR ("approvedStartOn" IS NOT NULL AND "approvedClosingAt" IS NOT NULL AND "approvedAt" IS NOT NULL));
ALTER TABLE "TenderPack" ADD CONSTRAINT "TenderPack_returned_reason"
  CHECK ("status" <> 'RETURNED' OR ("returnedAt" IS NOT NULL AND "returnedReason" <> ''));

-- An omitted part says why.
ALTER TABLE "TenderPackPart" ADD CONSTRAINT "TenderPackPart_omitted_reason"
  CHECK ("state" <> 'OMITTED' OR "omittedReason" <> '');

-- A frozen part names its template exactly when it was drawn from one.
ALTER TABLE "TenderPackDocument" ADD CONSTRAINT "TenderPackDocument_template_source"
  CHECK (("source" = 'TEMPLATE') = ("templateId" IS NOT NULL AND "templateBodyVersion" IS NOT NULL));

-- Q-6: LAD is an amount a day or a percentage of the sum a day, never both.
ALTER TABLE "ConditionsAppendix" ADD CONSTRAINT "ConditionsAppendix_lad_kind"
  CHECK (("ladKind" IS NULL AND "ladAmount" IS NULL AND "ladPct" IS NULL)
    OR ("ladKind" = 'AMOUNT_PER_DAY' AND "ladPct" IS NULL)
    OR ("ladKind" = 'PERCENT_OF_SUM_PER_DAY' AND "ladAmount" IS NULL));
ALTER TABLE "ConditionsAppendix" ADD CONSTRAINT "ConditionsAppendix_uplift_kind"
  CHECK (("worksInsuranceUpliftKind" IS NULL AND "worksInsuranceUpliftAmount" IS NULL AND "worksInsuranceUpliftPct" IS NULL)
    OR ("worksInsuranceUpliftKind" = 'AMOUNT' AND "worksInsuranceUpliftPct" IS NULL)
    OR ("worksInsuranceUpliftKind" = 'PERCENT' AND "worksInsuranceUpliftAmount" IS NULL));
-- A period of none is "does not apply", recorded as such, never 0 (BD-DS-10 precedent).
ALTER TABLE "ConditionsAppendix" ADD CONSTRAINT "ConditionsAppendix_periods_positive"
  CHECK (("dlpMonths" IS NULL OR "dlpMonths" > 0) AND ("honourCertificateDays" IS NULL OR "honourCertificateDays" > 0));
ALTER TABLE "ConditionsAppendix" ADD CONSTRAINT "ConditionsAppendix_amounts_not_negative"
  CHECK (COALESCE("tplMinimum", 0) >= 0 AND COALESCE("wcMinimum", 0) >= 0 AND COALESCE("worksInsuranceUpliftAmount", 0) >= 0
    AND COALESCE("worksInsuranceUpliftPct", 0) >= 0 AND COALESCE("insuranceExcess", 0) >= 0 AND COALESCE("ladAmount", 0) >= 0
    AND COALESCE("ladPct", 0) >= 0 AND COALESCE("firstInterimMinimum", 0) >= 0 AND COALESCE("subsequentInterimMinimum", 0) >= 0);

-- A variation limit is an office's or a committee's, one of the two.
ALTER TABLE "AppendixVariationLimit" ADD CONSTRAINT "AppendixVariationLimit_one_holder"
  CHECK (num_nonnulls("roleCode", "committeeCode") = 1);
ALTER TABLE "AppendixSection" ADD CONSTRAINT "AppendixSection_lad_kind"
  CHECK (("ladKind" IS NULL AND "ladAmount" IS NULL AND "ladPct" IS NULL)
    OR ("ladKind" = 'AMOUNT_PER_DAY' AND "ladPct" IS NULL)
    OR ("ladKind" = 'PERCENT_OF_SUM_PER_DAY' AND "ladAmount" IS NULL));

-- X-2: an exercise approved for tendering holds its start and closing.
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_tendering_dates"
  CHECK ("status" <> 'APPROVED_FOR_TENDERING' OR ("tenderingStartOn" IS NOT NULL AND "closingAt" IS NOT NULL AND "approvedForTenderingAt" IS NOT NULL));
