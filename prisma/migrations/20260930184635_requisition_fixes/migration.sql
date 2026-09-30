-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "routeCommitsBudget" BOOLEAN;

-- AlterTable
ALTER TABLE "FundingRoute" ADD COLUMN     "approvalCommitsBudget" BOOLEAN,
ADD COLUMN     "approvalCommitsBudgetProvenance" "Provenance";

-- AlterTable
ALTER TABLE "RequisitionPolicy" ADD COLUMN     "splitJustifyingRoleCode" TEXT;

-- AlterTable
ALTER TABLE "RequisitionSplitCheck" ADD COLUMN     "notSetReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_committeeDecisionId_key" ON "ApprovalStep"("committeeDecisionId");

-- Code review Q1: requisition bands do not follow the boundary switch (6.1 ruling OD-4)
UPDATE "AuthorityRule" SET "followsBoundarySwitch" = false WHERE "domain" = 'requisition';
