-- CreateEnum
CREATE TYPE "BaselineSource" AS ENUM ('APPENDIX', 'AWARD', 'BQ', 'DERIVED', 'ENTERED');

-- CreateEnum
CREATE TYPE "BaselineReason" AS ENUM ('CONFIRMED', 'EXECUTED', 'POSSESSION', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AssemblyPartState" AS ENUM ('READY', 'CANCELLED_BY_ALTERNATIVE');

-- CreateEnum
CREATE TYPE "ReconciliationComparison" AS ENUM ('TENDER_DOCUMENT', 'TENDER_TABLE_DOCUMENT', 'DRAWINGS');

-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM ('MATCHES', 'AMENDED');

-- CreateEnum
CREATE TYPE "FormationCheckKind" AS ENUM ('ARITHMETIC', 'FRONT_LOADING', 'RATE_UNIFORMITY', 'SOR_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LegalDecision" AS ENUM ('ENDORSED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SignatureParty" AS ENUM ('RSAJ', 'CONTRACTOR', 'WITNESS');

-- CreateEnum
CREATE TYPE "CustodyItemKind" AS ENUM ('CONTRACT', 'SECURITY', 'POLICY');

-- CreateEnum
CREATE TYPE "CustodyDirection" AS ENUM ('OUT', 'IN');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "consultingEngineer" BOOLEAN,
ADD COLUMN     "contractDate" TIMESTAMP(3),
ADD COLUMN     "contractDateCorrectedFrom" TIMESTAMP(3),
ADD COLUMN     "contractDateCorrectionReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contractDateRecordedAt" TIMESTAMP(3),
ADD COLUMN     "executedSnapshot" JSONB,
ADD COLUMN     "formationSnapshot" JSONB,
ADD COLUMN     "preparationStartedAt" TIMESTAMP(3),
ADD COLUMN     "stampedAt" TIMESTAMP(3),
ADD COLUMN     "stampedOn" TIMESTAMP(3),
ADD COLUMN     "stampingRef" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "contractId" TEXT;

-- AlterTable
ALTER TABLE "InsurancePolicy" ADD COLUMN     "wcCheckNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "wcCheckRecordedAt" TIMESTAMP(3),
ADD COLUMN     "wcCheckedByPersonId" TEXT,
ADD COLUMN     "wcCheckedOn" TIMESTAMP(3),
ADD COLUMN     "wcDeclaredUncoveredWages" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ContractPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "legalOfficeCode" TEXT,
    "frontLoadingRatio" DECIMAL(9,4),
    "controlledCopyStampEn" TEXT,
    "controlledCopyStampMs" TEXT,
    "signatoryCond" TEXT,
    "provenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ContractPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocumentPart" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractBasisCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "printedNumber" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ContractDocumentPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAssemblyPart" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,
    "labelMsSnapshot" TEXT,
    "printedNumber" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "state" "AssemblyPartState" NOT NULL DEFAULT 'READY',
    "cancelledStatement" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ContractAssemblyPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractReconciliation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "comparison" "ReconciliationComparison" NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "addendaSnapshot" JSONB NOT NULL,
    "checkedByPersonId" TEXT NOT NULL,
    "checkedOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationAmendment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contractorSignatoryName" TEXT NOT NULL,
    "contractorSignedOn" TIMESTAMP(3) NOT NULL,
    "officerPersonId" TEXT NOT NULL,
    "officerSignedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormationCheck" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "FormationCheckKind" NOT NULL,
    "completedByPersonId" TEXT,
    "completedOn" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "ratioSnapshot" DECIMAL(9,4),

    CONSTRAINT "FormationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArithmeticCorrection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "itemRef" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tendered" DECIMAL(18,2) NOT NULL,
    "corrected" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArithmeticCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateComparison" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "itemRef" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "tenderedRate" DECIMAL(18,2) NOT NULL,
    "estimateRate" DECIMAL(18,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalReview" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "officeCode" TEXT NOT NULL,
    "officeLabel" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "submittedByPersonId" TEXT NOT NULL,
    "pinnedVersions" JSONB NOT NULL,
    "decision" "LegalDecision",
    "decidedOn" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "reviewerPersonId" TEXT,
    "comments" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "LegalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "party" "SignatureParty" NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "icNumber" TEXT NOT NULL DEFAULT '',
    "capacity" TEXT NOT NULL DEFAULT '',
    "signedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "roleCode" TEXT,
    "roleLabel" TEXT,
    "ruleKey" TEXT,
    "ruleLabel" TEXT,
    "delegationId" TEXT,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityBriefing" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "participantIds" TEXT[],
    "participantNames" TEXT[],
    "contractorAttendees" TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrityBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractBaseline" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER,
    "reason" "BaselineReason",
    "correctionReason" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3),
    "recordedOn" TIMESTAMP(3),
    "contractSum" DECIMAL(18,2) NOT NULL,
    "contractDate" TIMESTAMP(3),
    "possessionDate" TIMESTAMP(3),
    "completionPeriod" INTEGER NOT NULL,
    "completionUnit" "PeriodUnit" NOT NULL,
    "dateForCompletion" TIMESTAMP(3),
    "dlpApplies" BOOLEAN,
    "dlpMonths" INTEGER,
    "dlpSource" "BaselineSource",
    "ladKind" "LadKind",
    "ladAmount" DECIMAL(18,2),
    "ladPct" DECIMAL(9,6),
    "ladUnit" TEXT NOT NULL DEFAULT '',
    "ladDaily" DECIMAL(18,2),
    "ladSource" "BaselineSource",
    "retentionApplies" BOOLEAN,
    "retentionPercent" DECIMAL(9,4),
    "retentionCapPercent" DECIMAL(9,4),
    "retentionSource" "BaselineSource",
    "pcSums" DECIMAL(18,2),
    "provisionalSums" DECIMAL(18,2),
    "sumsSource" "BaselineSource",
    "buildersWorksValue" DECIMAL(18,2),
    "firstInterimMinimum" DECIMAL(18,2),
    "firstInterimSource" "BaselineSource",
    "subsequentInterimMinimum" DECIMAL(18,2),
    "subsequentInterimSource" "BaselineSource",
    "honourCertificateDays" INTEGER,
    "honourSource" "BaselineSource",
    "unfixedMaterialsPct" DECIMAL(9,4),
    "onCostPct" DECIMAL(9,4),
    "designWorkValue" DECIMAL(18,2),
    "sectionalCompletion" BOOLEAN,
    "sectionalSource" "BaselineSource",
    "entered" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "ContractBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ladKind" "LadKind",
    "ladAmount" DECIMAL(18,2),
    "ladPct" DECIMAL(9,6),
    "ladDaily" DECIMAL(18,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCopyRecipient" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "copyForm" TEXT NOT NULL DEFAULT '',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "onlyWithConsultingEngineer" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ControlledCopyRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedCopy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT,
    "copyNo" INTEGER NOT NULL,
    "recipientId" TEXT,
    "recipientName" TEXT NOT NULL,
    "copyForm" TEXT NOT NULL DEFAULT '',
    "addressedTo" TEXT NOT NULL DEFAULT '',
    "stampText" TEXT NOT NULL,
    "method" "DeliveryMethod",
    "despatchedOn" TIMESTAMP(3),
    "acknowledgedOn" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recalledOn" TIMESTAMP(3),
    "recallReason" TEXT NOT NULL DEFAULT '',
    "reissueOfId" TEXT,

    CONSTRAINT "IssuedCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "CustodyItemKind" NOT NULL,
    "securityId" TEXT,
    "policyId" TEXT,
    "location" TEXT NOT NULL,
    "custodianPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustodyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyMovement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "direction" "CustodyDirection" NOT NULL,
    "personId" TEXT NOT NULL,
    "on" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustodyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractPolicy_organisationId_key" ON "ContractPolicy"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocumentPart_organisationId_contractBasisCode_code_key" ON "ContractDocumentPart"("organisationId", "contractBasisCode", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAssemblyPart_contractId_partCode_key" ON "ContractAssemblyPart"("contractId", "partCode");

-- CreateIndex
CREATE UNIQUE INDEX "ContractReconciliation_contractId_comparison_key" ON "ContractReconciliation"("contractId", "comparison");

-- CreateIndex
CREATE UNIQUE INDEX "FormationCheck_contractId_kind_key" ON "FormationCheck"("contractId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "LegalReview_contractId_iteration_key" ON "LegalReview"("contractId", "iteration");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignature_contractId_party_key" ON "ContractSignature"("contractId", "party");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrityBriefing_contractId_key" ON "IntegrityBriefing"("contractId");

-- CreateIndex
CREATE INDEX "ContractBaseline_contractId_idx" ON "ContractBaseline"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractBaseline_contractId_version_key" ON "ContractBaseline"("contractId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCopyRecipient_organisationId_code_key" ON "ControlledCopyRecipient"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCopy_reissueOfId_key" ON "IssuedCopy"("reissueOfId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCopy_contractId_copyNo_key" ON "IssuedCopy"("contractId", "copyNo");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyItem_securityId_key" ON "CustodyItem"("securityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyItem_policyId_key" ON "CustodyItem"("policyId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_contractId_idx" ON "DocumentAttachment"("contractId");

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_wcCheckedByPersonId_fkey" FOREIGN KEY ("wcCheckedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPolicy" ADD CONSTRAINT "ContractPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocumentPart" ADD CONSTRAINT "ContractDocumentPart_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAssemblyPart" ADD CONSTRAINT "ContractAssemblyPart_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAssemblyPart" ADD CONSTRAINT "ContractAssemblyPart_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReconciliation" ADD CONSTRAINT "ContractReconciliation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReconciliation" ADD CONSTRAINT "ContractReconciliation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReconciliation" ADD CONSTRAINT "ContractReconciliation_checkedByPersonId_fkey" FOREIGN KEY ("checkedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationAmendment" ADD CONSTRAINT "ReconciliationAmendment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationAmendment" ADD CONSTRAINT "ReconciliationAmendment_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "ContractReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationAmendment" ADD CONSTRAINT "ReconciliationAmendment_officerPersonId_fkey" FOREIGN KEY ("officerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormationCheck" ADD CONSTRAINT "FormationCheck_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormationCheck" ADD CONSTRAINT "FormationCheck_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormationCheck" ADD CONSTRAINT "FormationCheck_completedByPersonId_fkey" FOREIGN KEY ("completedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArithmeticCorrection" ADD CONSTRAINT "ArithmeticCorrection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArithmeticCorrection" ADD CONSTRAINT "ArithmeticCorrection_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "FormationCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateComparison" ADD CONSTRAINT "RateComparison_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateComparison" ADD CONSTRAINT "RateComparison_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "FormationCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReview" ADD CONSTRAINT "LegalReview_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReview" ADD CONSTRAINT "LegalReview_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReview" ADD CONSTRAINT "LegalReview_submittedByPersonId_fkey" FOREIGN KEY ("submittedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReview" ADD CONSTRAINT "LegalReview_reviewerPersonId_fkey" FOREIGN KEY ("reviewerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityBriefing" ADD CONSTRAINT "IntegrityBriefing_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityBriefing" ADD CONSTRAINT "IntegrityBriefing_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBaseline" ADD CONSTRAINT "ContractBaseline_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBaseline" ADD CONSTRAINT "ContractBaseline_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSection" ADD CONSTRAINT "ContractSection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSection" ADD CONSTRAINT "ContractSection_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ContractBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCopyRecipient" ADD CONSTRAINT "ControlledCopyRecipient_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ControlledCopyRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_reissueOfId_fkey" FOREIGN KEY ("reissueOfId") REFERENCES "IssuedCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyItem" ADD CONSTRAINT "CustodyItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyItem" ADD CONSTRAINT "CustodyItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyItem" ADD CONSTRAINT "CustodyItem_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "SecurityInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyItem" ADD CONSTRAINT "CustodyItem_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyItem" ADD CONSTRAINT "CustodyItem_custodianPersonId_fkey" FOREIGN KEY ("custodianPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyMovement" ADD CONSTRAINT "CustodyMovement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyMovement" ADD CONSTRAINT "CustodyMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CustodyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyMovement" ADD CONSTRAINT "CustodyMovement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- X-6: the contract is an attachment owner. Both owner CHECKs rebuilt from the full owner list.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'WITHDRAWAL_LETTER' AND "bidWithdrawalId" IS NOT NULL)
    OR ("purpose" = 'VALIDITY_CONSENT' AND "validityExtensionId" IS NOT NULL)
    OR ("purpose" = 'SIGNED_SCHEDULE' AND "openingId" IS NOT NULL)
    OR ("purpose" IN ('REPORT_DRAWINGS', 'SIGNED_REPORT', 'SIGNED_PROPOSAL_PAPER') AND "evaluationId" IS NOT NULL)
    OR ("purpose" IN ('MEETING_MINUTES', 'TENDERER_CONFIRMATION') AND "evaluationMeetingId" IS NOT NULL)
    OR ("purpose" IN ('CPR_REPORT', 'COMMUNICATION') AND "evaluationBidderId" IS NOT NULL)
    OR ("purpose" = 'SUPPLIER_DOCUMENT' AND "supplierDocumentId" IS NOT NULL)
    OR ("purpose" IN ('SUPPLIER_DECLARATION', 'SUPPLIER_EPAYMENT_FORM') AND "supplierApplicationId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
  );

-- FR-CON-012: a controlled copy has exactly one owner. A contract now, a certificate when 6.14 adds it.
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_one_owner"
  CHECK (num_nonnulls("contractId") = 1);

-- FR-CON-013: an original in custody names exactly the key its kind needs.
ALTER TABLE "CustodyItem" ADD CONSTRAINT "CustodyItem_kind_key"
  CHECK (
    ("kind" = 'CONTRACT' AND "securityId" IS NULL AND "policyId" IS NULL)
    OR ("kind" = 'SECURITY' AND "securityId" IS NOT NULL AND "policyId" IS NULL)
    OR ("kind" = 'POLICY' AND "policyId" IS NOT NULL AND "securityId" IS NULL)
  );

-- One original Contract Document in custody per contract.
CREATE UNIQUE INDEX "CustodyItem_one_contract_original" ON "CustodyItem"("contractId") WHERE "kind" = 'CONTRACT';

-- ADR 0021: one draft baseline per contract. A version has its reason and the moment it was recorded, a draft neither.
CREATE UNIQUE INDEX "ContractBaseline_one_draft" ON "ContractBaseline"("contractId") WHERE "version" IS NULL;
ALTER TABLE "ContractBaseline" ADD CONSTRAINT "ContractBaseline_version_recorded"
  CHECK ((("version" IS NULL) = ("reason" IS NULL)) AND (("version" IS NULL) = ("recordedAt" IS NULL)) AND (("version" IS NULL) = ("recordedOn" IS NULL)));
ALTER TABLE "ContractBaseline" ADD CONSTRAINT "ContractBaseline_correction_reason"
  CHECK ("reason" IS DISTINCT FROM 'CORRECTION' OR btrim("correctionReason") <> '');

-- FR-CON-003: a part cancelled by an accepted alternative states what is cancelled.
ALTER TABLE "ContractAssemblyPart" ADD CONSTRAINT "ContractAssemblyPart_cancelled_statement"
  CHECK ("state" <> 'CANCELLED_BY_ALTERNATIVE' OR btrim("cancelledStatement") <> '');

-- FR-CON-005: a complete check names its officer and its day, an open one neither.
ALTER TABLE "FormationCheck" ADD CONSTRAINT "FormationCheck_completed_by"
  CHECK (("completedByPersonId" IS NULL) = ("completedOn" IS NULL) AND ("completedOn" IS NULL) = ("completedAt" IS NULL));

-- FR-CON-006: a decided review has its day and its reviewer.
ALTER TABLE "LegalReview" ADD CONSTRAINT "LegalReview_decided"
  CHECK (("decision" IS NULL) = ("decidedOn" IS NULL) AND ("decision" IS NULL) = ("reviewerPersonId" IS NULL) AND ("decision" IS NULL) = ("decidedAt" IS NULL));

-- An RSAJ signature names the Person who signed, a contractor or witness signature does not.
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_rsaj_person"
  CHECK (("party" = 'RSAJ') = ("personId" IS NOT NULL));
