-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'ENDORSED', 'RETURNED', 'REGISTERED', 'BUDGET_CHECKED', 'OVER_BUDGET', 'PENDING_APPROVAL', 'REJECTED', 'RECALLED', 'APPROVED', 'SOURCING', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RequisitionOrigin" AS ENUM ('PORTAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ExternalRefSource" AS ENUM ('MANUAL', 'ADAPTER');

-- CreateEnum
CREATE TYPE "BudgetCheckSource" AS ENUM ('PORTAL_LEDGER', 'MANUAL_ERP_ENTRY');

-- CreateEnum
CREATE TYPE "BudgetVerdictState" AS ENUM ('WITHIN', 'EXCEEDS', 'NO_BUDGET', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "SplitState" AS ENUM ('CLEAR', 'FLAGGED', 'NOT_SET');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RECALLED');

-- CreateEnum
CREATE TYPE "StepDecision" AS ENUM ('PENDING', 'DONE', 'REJECTED');

-- CreateEnum
CREATE TYPE "BoundaryOperator" AS ENUM ('GT', 'GTE');

-- AlterTable
ALTER TABLE "AuthorityMatrix" ADD COLUMN     "fundingRouteCode" TEXT;

-- AlterTable
ALTER TABLE "AuthorityRule" ADD COLUMN     "followsBoundarySwitch" BOOLEAN;

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "requisitionId" TEXT;

-- AlterTable
ALTER TABLE "FinanceIntegration" ADD COLUMN     "budgetCheckSource" "BudgetCheckSource";

-- AlterTable
ALTER TABLE "FundingRoute" ADD COLUMN     "externalAuthorityRefLabel" TEXT,
ADD COLUMN     "requiresExternalAuthorityRef" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "origin" "RequisitionOrigin" NOT NULL DEFAULT 'PORTAL',
    "erpRequisitionNo" TEXT,
    "erpNoteNo" TEXT,
    "erpRefSource" "ExternalRefSource",
    "erpRefRecordedAt" TIMESTAMP(3),
    "requestingUnitCode" TEXT NOT NULL,
    "sectionUnitCode" TEXT,
    "requestingPersonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "needStatement" TEXT NOT NULL,
    "costCentreCode" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "budgetCodeId" TEXT,
    "siteCode" TEXT,
    "placeOfDelivery" TEXT NOT NULL,
    "dateRequired" TIMESTAMP(3) NOT NULL,
    "estimatedValue" DECIMAL(18,2) NOT NULL,
    "raisedOn" TIMESTAMP(3) NOT NULL,
    "fundingRouteCode" TEXT,
    "fundingSupersedesAuthority" BOOLEAN,
    "sourcingPermitted" BOOLEAN,
    "fundingPosture" TEXT,
    "externalAuthorityRef" TEXT,
    "contractTypeCode" TEXT,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "returnedReason" TEXT NOT NULL DEFAULT '',
    "returnedToPersonId" TEXT,
    "returnedOn" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "commitmentMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "unit" TEXT,
    "estimatedUnitPrice" DECIMAL(18,2),
    "estimatedAmount" DECIMAL(18,2) NOT NULL,
    "catalogueRef" TEXT,

    CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionEndorsement" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "tier" "OrgUnitKind" NOT NULL,
    "unitCode" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "endorsedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RequisitionEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionBudgetCheck" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asAt" TIMESTAMP(3) NOT NULL,
    "source" "BudgetCheckSource" NOT NULL,
    "budgetCodeId" TEXT,
    "budgetCodeCode" TEXT,
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "actualBudget" DECIMAL(18,2),
    "balanceAsAt" DECIMAL(18,2),
    "approvedAccount" DECIMAL(18,2),
    "approvedAccountProvenance" "Provenance" NOT NULL,
    "projectedBalance" DECIMAL(18,2),
    "verdict" "BudgetVerdictState" NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RequisitionBudgetCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionSplitCheck" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" "SplitState" NOT NULL,
    "windowDays" INTEGER,
    "matchOn" TEXT[],
    "aggregateAcrossYear" BOOLEAN,
    "policyProvenance" "Provenance",
    "relatedRequisitionIds" TEXT[],
    "relatedReferences" TEXT[],
    "combinedValue" DECIMAL(18,2),
    "crossesBand" BOOLEAN,
    "overrideJustification" TEXT,
    "overriddenOn" TIMESTAMP(3),
    "overriddenByPersonId" TEXT,
    "overriddenAt" TIMESTAMP(3),

    CONSTRAINT "RequisitionSplitCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "splittingWindowDays" INTEGER,
    "splittingMatchOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "splittingAggregateAcrossYear" BOOLEAN,
    "budgetRecheckDays" INTEGER,
    "endorsementTiers" "OrgUnitKind"[] DEFAULT ARRAY[]::"OrgUnitKind"[],
    "erpReferenceRequired" BOOLEAN,
    "provenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RequisitionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalInstance" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "matterKind" "MatterKind" NOT NULL,
    "requisitionId" TEXT,
    "domain" TEXT NOT NULL,
    "cond" TEXT,
    "value" DECIMAL(18,2) NOT NULL,
    "authorityMatrixId" TEXT,
    "matrixLabel" TEXT,
    "ruleKey" TEXT,
    "ruleLabel" TEXT,
    "ruleClause" TEXT,
    "boundaryValue" DECIMAL(18,2),
    "boundaryInclusive" BOOLEAN,
    "ruleFollowsBoundarySwitch" BOOLEAN,
    "boundaryOperator" "BoundaryOperator",
    "fundingRouteCode" TEXT,
    "fundingOverrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "overrideMatrixId" TEXT,
    "overrideMatrixLabel" TEXT,
    "budgetCheckId" TEXT,
    "budgetVerdict" "BudgetVerdictState",
    "availabilityCheck" TEXT,
    "overBudgetInvoked" BOOLEAN NOT NULL DEFAULT false,
    "splitCheckId" TEXT,
    "splitState" "SplitState",
    "checkedAgainstMatrix" BOOLEAN NOT NULL DEFAULT true,
    "commitOnApproval" BOOLEAN,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "roleCode" TEXT,
    "roleLabel" TEXT NOT NULL,
    "act" "AuthorityAct" NOT NULL,
    "committeeCode" TEXT,
    "nonDelegable" BOOLEAN NOT NULL DEFAULT false,
    "sourceRuleKey" TEXT,
    "decision" "StepDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByPersonId" TEXT,
    "decidedByName" TEXT,
    "decidedOn" TIMESTAMP(3),
    "delegationId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "committeeDecisionId" TEXT,
    "recordedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Requisition_organisationId_status_idx" ON "Requisition"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Requisition_organisationId_raisedOn_idx" ON "Requisition"("organisationId", "raisedOn");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_organisationId_reference_key" ON "Requisition"("organisationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_organisationId_erpRequisitionNo_key" ON "Requisition"("organisationId", "erpRequisitionNo");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_organisationId_erpNoteNo_key" ON "Requisition"("organisationId", "erpNoteNo");

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionLine_requisitionId_lineNo_key" ON "RequisitionLine"("requisitionId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionEndorsement_requisitionId_tier_key" ON "RequisitionEndorsement"("requisitionId", "tier");

-- CreateIndex
CREATE INDEX "RequisitionBudgetCheck_requisitionId_checkedAt_idx" ON "RequisitionBudgetCheck"("requisitionId", "checkedAt");

-- CreateIndex
CREATE INDEX "RequisitionSplitCheck_requisitionId_checkedAt_idx" ON "RequisitionSplitCheck"("requisitionId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionPolicy_organisationId_key" ON "RequisitionPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_organisationId_matterKind_idx" ON "ApprovalInstance"("organisationId", "matterKind");

-- CreateIndex
CREATE INDEX "ApprovalInstance_requisitionId_idx" ON "ApprovalInstance"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_instanceId_sequence_key" ON "ApprovalStep"("instanceId", "sequence");

-- CreateIndex
CREATE INDEX "CommitteeDecision_requisitionId_idx" ON "CommitteeDecision"("requisitionId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_requestingPersonId_fkey" FOREIGN KEY ("requestingPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "BudgetCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_returnedToPersonId_fkey" FOREIGN KEY ("returnedToPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionEndorsement" ADD CONSTRAINT "RequisitionEndorsement_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionEndorsement" ADD CONSTRAINT "RequisitionEndorsement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionBudgetCheck" ADD CONSTRAINT "RequisitionBudgetCheck_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionBudgetCheck" ADD CONSTRAINT "RequisitionBudgetCheck_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "BudgetCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionSplitCheck" ADD CONSTRAINT "RequisitionSplitCheck_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionSplitCheck" ADD CONSTRAINT "RequisitionSplitCheck_overriddenByPersonId_fkey" FOREIGN KEY ("overriddenByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionPolicy" ADD CONSTRAINT "RequisitionPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_authorityMatrixId_fkey" FOREIGN KEY ("authorityMatrixId") REFERENCES "AuthorityMatrix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_overrideMatrixId_fkey" FOREIGN KEY ("overrideMatrixId") REFERENCES "AuthorityMatrix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_budgetCheckId_fkey" FOREIGN KEY ("budgetCheckId") REFERENCES "RequisitionBudgetCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_splitCheckId_fkey" FOREIGN KEY ("splitCheckId") REFERENCES "RequisitionSplitCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ApprovalInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_committeeDecisionId_fkey" FOREIGN KEY ("committeeDecisionId") REFERENCES "CommitteeDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (6.1 ruling OD-4): every rule that existed before the per-rule switch followed it
UPDATE "AuthorityRule" SET "followsBoundarySwitch" = true;
