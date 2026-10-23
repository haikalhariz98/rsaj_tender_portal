-- Simplification plan 5.8, requirement-trace row 44: the splitting settings go with FR-REQ-015 (founder removed it 2026-10-05).
-- Nothing has read or written them since. AuthorityMatrix.splittingWindowDays was already never read (6.1 ruling OD-9).
-- Kept: RequisitionSplitCheck, ApprovalInstance.splitCheckId and splitState, and the SplitState enum, the history of
-- decided requisitions. Old audit rows that name these fields still read in History.

-- AlterTable
ALTER TABLE "AuthorityMatrix" DROP COLUMN "splittingWindowDays";

-- AlterTable
ALTER TABLE "RequisitionPolicy" DROP COLUMN "splitJustifyingRoleCode",
DROP COLUMN "splittingAggregateAcrossYear",
DROP COLUMN "splittingMatchOn",
DROP COLUMN "splittingWindowDays";
