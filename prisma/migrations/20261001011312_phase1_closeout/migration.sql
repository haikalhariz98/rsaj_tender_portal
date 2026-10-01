-- CreateEnum
CREATE TYPE "RejectionDestinationKind" AS ENUM ('RETURN_TO_ORIGINATOR', 'RETURN_TO_STEP', 'TERMINATE');

-- CreateEnum
CREATE TYPE "RejectionSource" AS ENUM ('CONFIGURED', 'COMMITTEE_OUTCOME', 'OFFICER_CHOICE');

-- CreateEnum
CREATE TYPE "StepEscalation" AS ENUM ('NO_AVAILABLE_HOLDER', 'CONFLICT_DECLARED');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "rejectionApplied" "RejectionDestinationKind",
ADD COLUMN     "rejectionChoiceWhy" TEXT,
ADD COLUMN     "rejectionChoices" "RejectionDestinationKind"[] DEFAULT ARRAY[]::"RejectionDestinationKind"[],
ADD COLUMN     "rejectionChosenByPersonId" TEXT,
ADD COLUMN     "rejectionDestinationId" TEXT,
ADD COLUMN     "rejectionKind" "RejectionDestinationKind",
ADD COLUMN     "rejectionProvenance" "Provenance",
ADD COLUMN     "rejectionReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rejectionReturnToRoleCode" TEXT,
ADD COLUMN     "rejectionSnapshotAt" TIMESTAMP(3),
ADD COLUMN     "rejectionSource" "RejectionSource",
ADD COLUMN     "supersedesInstanceId" TEXT;

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "actingRoleCode" TEXT,
ADD COLUMN     "actingRoleLabel" TEXT,
ADD COLUMN     "carriedFromStepId" TEXT,
ADD COLUMN     "declaredByPersonId" TEXT,
ADD COLUMN     "escalatedOn" TIMESTAMP(3),
ADD COLUMN     "escalation" "StepEscalation",
ADD COLUMN     "escalationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "escalationReason" TEXT;

-- AlterTable
ALTER TABLE "Committee" ADD COLUMN     "carriedLabelEn" TEXT,
ADD COLUMN     "carriedLabelMs" TEXT;

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "requisitionGateId" TEXT,
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnReason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Delegation" ADD COLUMN     "holderRecommendation" TEXT,
ADD COLUMN     "holderRecommendedOn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FundingRoute" ADD COLUMN     "committeeGateProvenance" "Provenance",
ADD COLUMN     "committeeGateRequired" BOOLEAN;

-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN     "closedReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gateRequired" BOOLEAN,
ADD COLUMN     "gateRequiredProvenance" "Provenance",
ADD COLUMN     "gatesDeterminedOn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RejectionDestination" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "kind" "RejectionDestinationKind" NOT NULL,
    "returnToRoleCode" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeGateRule" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fundingRouteCode" TEXT NOT NULL,
    "committeeCode" TEXT NOT NULL,
    "subjectEn" TEXT NOT NULL,
    "subjectMs" TEXT,
    "act" "AuthorityAct" NOT NULL,
    "aboveValue" DECIMAL(18,2),
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommitteeGateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionGate" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "gateRuleId" TEXT NOT NULL,
    "committeeCode" TEXT NOT NULL,
    "committeeLabel" TEXT NOT NULL,
    "subjectEn" TEXT NOT NULL,
    "act" "AuthorityAct" NOT NULL,
    "aboveValue" DECIMAL(18,2),
    "ruleProvenance" "Provenance" NOT NULL,
    "determinedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisitionGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExport" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromDay" TIMESTAMP(3) NOT NULL,
    "toDay" TIMESTAMP(3) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RejectionDestination_organisationId_domain_idx" ON "RejectionDestination"("organisationId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "RejectionDestination_organisationId_domain_effectiveFrom_key" ON "RejectionDestination"("organisationId", "domain", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommitteeGateRule_organisationId_fundingRouteCode_idx" ON "CommitteeGateRule"("organisationId", "fundingRouteCode");

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeGateRule_organisationId_fundingRouteCode_committee_key" ON "CommitteeGateRule"("organisationId", "fundingRouteCode", "committeeCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionGate_requisitionId_gateRuleId_key" ON "RequisitionGate"("requisitionId", "gateRuleId");

-- CreateIndex
CREATE INDEX "AuditExport_organisationId_generatedAt_idx" ON "AuditExport"("organisationId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalInstance_supersedesInstanceId_key" ON "ApprovalInstance"("supersedesInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_carriedFromStepId_key" ON "ApprovalStep"("carriedFromStepId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_requisitionGateId_idx" ON "CommitteeDecision"("requisitionGateId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_requisitionGateId_fkey" FOREIGN KEY ("requisitionGateId") REFERENCES "RequisitionGate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_rejectionDestinationId_fkey" FOREIGN KEY ("rejectionDestinationId") REFERENCES "RejectionDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_rejectionChosenByPersonId_fkey" FOREIGN KEY ("rejectionChosenByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_supersedesInstanceId_fkey" FOREIGN KEY ("supersedesInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_carriedFromStepId_fkey" FOREIGN KEY ("carriedFromStepId") REFERENCES "ApprovalStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_declaredByPersonId_fkey" FOREIGN KEY ("declaredByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejectionDestination" ADD CONSTRAINT "RejectionDestination_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeGateRule" ADD CONSTRAINT "CommitteeGateRule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionGate" ADD CONSTRAINT "RequisitionGate_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionGate" ADD CONSTRAINT "RequisitionGate_gateRuleId_fkey" FOREIGN KEY ("gateRuleId") REFERENCES "CommitteeGateRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExport" ADD CONSTRAINT "AuditExport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
