-- CreateEnum
CREATE TYPE "AwardStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AwardInstrumentKind" AS ENUM ('LETTER_OF_ACCEPTANCE', 'WORK_INDENT');

-- CreateEnum
CREATE TYPE "AwardDocumentKind" AS ENUM ('LETTER_OF_ACCEPTANCE', 'SUCCESSFUL_BIDDER_DECLARATION', 'APPOINTMENT_LETTER', 'INDENT_COVERING_MEMO');

-- CreateEnum
CREATE TYPE "DocumentLanguage" AS ENUM ('MS', 'EN');

-- CreateEnum
CREATE TYPE "PeriodUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('REGISTERED_POST', 'COLLECTION', 'BY_HAND');

-- CreateEnum
CREATE TYPE "SecurityKind" AS ENUM ('PERFORMANCE_BOND', 'ADVANCE_PAYMENT_GUARANTEE', 'DESIGN_GUARANTEE_BOND', 'RETENTION_BOND');

-- CreateEnum
CREATE TYPE "SecurityForm" AS ENUM ('BANK_GUARANTEE', 'INSURANCE_GUARANTEE', 'CASH', 'BANKERS_DRAFT');

-- CreateEnum
CREATE TYPE "BondBasis" AS ENUM ('CONTRACT_PRICE', 'ANNUAL_VALUE', 'STATED_AMOUNT');

-- CreateEnum
CREATE TYPE "InsuranceKind" AS ENUM ('WORKS', 'PUBLIC_LIABILITY', 'WORKMENS_COMPENSATION', 'CAR', 'EAR');

-- CreateEnum
CREATE TYPE "WcBasis" AS ENUM ('UNCOVERED_WAGES', 'PERCENT_OF_CONTRACT');

-- CreateEnum
CREATE TYPE "RegisterStatus" AS ENUM ('LODGED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IssuerKind" AS ENUM ('BANK', 'INSURER', 'TAKAFUL');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('NUMBER_ALLOCATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractNumberSource" AS ENUM ('SERIES', 'INDENT_NUMBER');

-- CreateEnum
CREATE TYPE "QuotationContractKey" AS ENUM ('INDENT_NUMBER', 'CONTRACT_SERIES');

-- CreateEnum
CREATE TYPE "NonCommencement" AS ENUM ('CANCEL_AND_BLACKLIST', 'WARNING_LETTER');

-- CreateEnum
CREATE TYPE "CommitmentKind" AS ENUM ('INDENT', 'PURCHASE_ORDER');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "awardId" TEXT;

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "receivedOn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "exerciseId" TEXT;

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "contractSeriesKey" TEXT;

-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "bodyEn" TEXT,
ADD COLUMN     "bodyMs" TEXT,
ADD COLUMN     "bodyVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "primaryLanguage" "DocumentLanguage";

-- CreateTable
CREATE TABLE "AwardPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenderInstrument" "AwardInstrumentKind",
    "quotationInstrument" "AwardInstrumentKind",
    "indentValidityDays" INTEGER,
    "commencementGraceDays" INTEGER,
    "acceptanceReturnDays" INTEGER,
    "preContractUnitCode" TEXT,
    "postContractUnitCode" TEXT,
    "quotationContractKey" "QuotationContractKey",
    "regulatedActivityLabel" TEXT,
    "loaTemplateId" TEXT,
    "declarationTemplateId" TEXT,
    "coveringMemoTemplateId" TEXT,
    "provenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AwardPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "status" "AwardStatus" NOT NULL DEFAULT 'DRAFT',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "cancelConsequence" "NonCommencement",
    "instrumentKind" "AwardInstrumentKind" NOT NULL,
    "awardeeName" TEXT NOT NULL,
    "awardeeRegistrationNo" TEXT NOT NULL DEFAULT '',
    "awardeeAddress" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT,
    "awardedValue" DECIMAL(18,2) NOT NULL,
    "completionPeriod" INTEGER NOT NULL,
    "completionUnit" "PeriodUnit" NOT NULL,
    "startDate" TIMESTAMP(3),
    "commencedOn" TIMESTAMP(3),
    "regulatedActivity" BOOLEAN,
    "bondRequired" BOOLEAN,
    "bondNotRequiredReason" TEXT NOT NULL DEFAULT '',
    "bondBasis" "BondBasis",
    "bondPercent" DECIMAL(9,4),
    "bondBasisAmount" DECIMAL(18,2),
    "bondValidityExtraMonths" INTEGER,
    "bondBasisProvenance" "Provenance",
    "bondBasisNote" TEXT NOT NULL DEFAULT '',
    "ladAmount" DECIMAL(18,2),
    "ladUnit" TEXT NOT NULL DEFAULT '',
    "retentionPercent" DECIMAL(9,4),
    "retentionCapPercent" DECIMAL(9,4),
    "dlpMonths" INTEGER,
    "termsProvenance" "Provenance",
    "wcBasis" "WcBasis",
    "signatoryRoleCode" TEXT,
    "signatoryRoleLabel" TEXT,
    "signatoryRuleKey" TEXT,
    "signatoryRuleLabel" TEXT,
    "signatoryPersonId" TEXT,
    "signatoryName" TEXT,
    "signedOn" TIMESTAMP(3),
    "signatoryDelegationId" TEXT,
    "erpCommitmentNo" TEXT,
    "erpCommitmentKind" "CommitmentKind",
    "commitmentRecordedOn" TIMESTAMP(3),
    "indentReceivedOn" TIMESTAMP(3),
    "variantId" TEXT,
    "variantName" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issueSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardDocument" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "kind" "AwardDocumentKind" NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateFormCode" TEXT NOT NULL DEFAULT '',
    "templateRevisionDate" TIMESTAMP(3),
    "templateBodyVersion" INTEGER NOT NULL,
    "language" "DocumentLanguage" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fields" JSONB NOT NULL,
    "renderedText" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionRecipient" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "instrumentKind" "AwardInstrumentKind" NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "onlyWhenRegulated" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "DistributionRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardDistribution" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientName" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "isAwardee" BOOLEAN NOT NULL DEFAULT false,
    "method" "DeliveryMethod",
    "consignmentRef" TEXT NOT NULL DEFAULT '',
    "despatchedOn" TIMESTAMP(3),
    "acknowledgedOn" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AwardDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardReturn" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "signedLetterReceivedOn" TIMESTAMP(3),
    "declarationReceivedOn" TIMESTAMP(3),
    "authorisationReceivedOn" TIMESTAMP(3),
    "receivedByPersonId" TEXT,
    "whereHeld" TEXT NOT NULL DEFAULT '',
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "icNumber" TEXT NOT NULL DEFAULT '',
    "occupation" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "capacity" TEXT NOT NULL DEFAULT '',
    "contractorSigned" BOOLEAN,
    "stampAffixed" BOOLEAN,
    "witnessName" TEXT NOT NULL DEFAULT '',
    "witnessSigned" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentLetterVariant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "contractTypeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "termsBandKey" TEXT,
    "nonCommencement" "NonCommencement",
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "AppointmentLetterVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionPrecedentKind" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "excludesEotReason" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ConditionPrecedentKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardCondition" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "kindName" TEXT NOT NULL,
    "excludesEot" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT NOT NULL DEFAULT '',
    "requiredBy" TIMESTAMP(3),
    "satisfiedOn" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AwardCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "numberSource" "ContractNumberSource" NOT NULL,
    "seriesKey" TEXT,
    "numberedOn" TIMESTAMP(3) NOT NULL,
    "awardId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'NUMBER_ALLOCATED',
    "contractSum" DECIMAL(18,2) NOT NULL,
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseOwnershipEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromUnitCode" TEXT,
    "toUnitCode" TEXT,
    "on" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CaseOwnershipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedIssuer" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "IssuerKind" NOT NULL,
    "listSource" TEXT NOT NULL DEFAULT '',
    "listAsAt" TIMESTAMP(3),
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ApprovedIssuer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityInstrument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "SecurityKind" NOT NULL,
    "form" "SecurityForm" NOT NULL,
    "issuerId" TEXT,
    "issuerNameAsWritten" TEXT NOT NULL DEFAULT '',
    "instrumentRef" TEXT NOT NULL DEFAULT '',
    "value" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "status" "RegisterStatus" NOT NULL DEFAULT 'LODGED',
    "lodgedOn" TIMESTAMP(3) NOT NULL,
    "verifiedOn" TIMESTAMP(3),
    "verifiedByPersonId" TEXT,
    "rejectedReason" TEXT NOT NULL DEFAULT '',
    "requiredValue" DECIMAL(18,2),
    "basis" "BondBasis",
    "basisPercent" DECIMAL(9,4),
    "basisAmount" DECIMAL(18,2),
    "basisProvenance" "Provenance",
    "requiredUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceRequirement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "kind" "InsuranceKind" NOT NULL,
    "contractTypeCode" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "percent" DECIMAL(9,4),
    "tailMonths" INTEGER,
    "tailDays" INTEGER,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "InsuranceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiabilityBand" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "minValue" DECIMAL(18,2),
    "maxValue" DECIMAL(18,2),
    "limitAmount" DECIMAL(18,2) NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "LiabilityBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "InsuranceKind" NOT NULL,
    "substitutesFor" "InsuranceKind",
    "issuerId" TEXT,
    "issuerNameAsWritten" TEXT NOT NULL DEFAULT '',
    "policyNo" TEXT NOT NULL DEFAULT '',
    "sumInsured" DECIMAL(18,2) NOT NULL,
    "appendixAmount" DECIMAL(18,2),
    "requiredLimit" DECIMAL(18,2),
    "raisedJustification" TEXT NOT NULL DEFAULT '',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "premiumReceiptRef" TEXT NOT NULL DEFAULT '',
    "perkesoRegistrationNo" TEXT NOT NULL DEFAULT '',
    "status" "RegisterStatus" NOT NULL DEFAULT 'LODGED',
    "lodgedOn" TIMESTAMP(3) NOT NULL,
    "verifiedOn" TIMESTAMP(3),
    "verifiedByPersonId" TEXT,
    "rejectedReason" TEXT NOT NULL DEFAULT '',
    "requirementSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardPolicy_organisationId_key" ON "AwardPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "Award_organisationId_status_idx" ON "Award"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Award_exerciseId_idx" ON "Award"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "Award_organisationId_reference_key" ON "Award"("organisationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Award_organisationId_erpCommitmentNo_key" ON "Award"("organisationId", "erpCommitmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "AwardDocument_awardId_kind_version_key" ON "AwardDocument"("awardId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRecipient_organisationId_code_key" ON "DistributionRecipient"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AwardReturn_awardId_key" ON "AwardReturn"("awardId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentLetterVariant_organisationId_code_key" ON "AppointmentLetterVariant"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionPrecedentKind_organisationId_code_key" ON "ConditionPrecedentKind"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_awardId_key" ON "Contract"("awardId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organisationId_number_key" ON "Contract"("organisationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedIssuer_organisationId_code_key" ON "ApprovedIssuer"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceRequirement_organisationId_code_key" ON "InsuranceRequirement"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityBand_organisationId_code_key" ON "LiabilityBand"("organisationId", "code");

-- CreateIndex
CREATE INDEX "ApprovalInstance_awardId_idx" ON "ApprovalInstance"("awardId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_exerciseId_idx" ON "CommitteeDecision"("exerciseId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardPolicy" ADD CONSTRAINT "AwardPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardPolicy" ADD CONSTRAINT "AwardPolicy_loaTemplateId_fkey" FOREIGN KEY ("loaTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardPolicy" ADD CONSTRAINT "AwardPolicy_declarationTemplateId_fkey" FOREIGN KEY ("declarationTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardPolicy" ADD CONSTRAINT "AwardPolicy_coveringMemoTemplateId_fkey" FOREIGN KEY ("coveringMemoTemplateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_signatoryPersonId_fkey" FOREIGN KEY ("signatoryPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_signatoryDelegationId_fkey" FOREIGN KEY ("signatoryDelegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "AppointmentLetterVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardDocument" ADD CONSTRAINT "AwardDocument_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardDocument" ADD CONSTRAINT "AwardDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecipient" ADD CONSTRAINT "DistributionRecipient_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardDistribution" ADD CONSTRAINT "AwardDistribution_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardDistribution" ADD CONSTRAINT "AwardDistribution_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "DistributionRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardReturn" ADD CONSTRAINT "AwardReturn_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardReturn" ADD CONSTRAINT "AwardReturn_receivedByPersonId_fkey" FOREIGN KEY ("receivedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLetterVariant" ADD CONSTRAINT "AppointmentLetterVariant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLetterVariant" ADD CONSTRAINT "AppointmentLetterVariant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionPrecedentKind" ADD CONSTRAINT "ConditionPrecedentKind_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardCondition" ADD CONSTRAINT "AwardCondition_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardCondition" ADD CONSTRAINT "AwardCondition_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "ConditionPrecedentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseOwnershipEvent" ADD CONSTRAINT "CaseOwnershipEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedIssuer" ADD CONSTRAINT "ApprovedIssuer_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityInstrument" ADD CONSTRAINT "SecurityInstrument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityInstrument" ADD CONSTRAINT "SecurityInstrument_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "ApprovedIssuer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityInstrument" ADD CONSTRAINT "SecurityInstrument_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRequirement" ADD CONSTRAINT "InsuranceRequirement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiabilityBand" ADD CONSTRAINT "LiabilityBand_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "ApprovedIssuer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
