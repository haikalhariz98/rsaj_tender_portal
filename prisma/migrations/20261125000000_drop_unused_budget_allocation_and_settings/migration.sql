-- Audit fix batch A (founder, approved 2026-10-23: delete what nobody uses). Destructive, demo values only.
--   #2   five BudgetSettings columns were saved and shown but read by no rule: overrideRoleCodes, overCommitmentTolerancePercent,
--        advanceRecoupmentRatePercent, minimumInterimCertificate, paymentTargetDays.
--   #11  the old allocation and commitment model (BudgetAllocation, BudgetCommitment) was replaced by the budget code movement ledger
--        (ADR 0004) and read by nothing. BudgetCommitment hangs only off BudgetAllocation, and nothing else references either table.

-- DropForeignKey
ALTER TABLE "BudgetAllocation" DROP CONSTRAINT "BudgetAllocation_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "BudgetCommitment" DROP CONSTRAINT "BudgetCommitment_allocationId_fkey";

-- AlterTable
ALTER TABLE "BudgetSettings" DROP COLUMN "advanceRecoupmentRatePercent",
DROP COLUMN "minimumInterimCertificate",
DROP COLUMN "overCommitmentTolerancePercent",
DROP COLUMN "overrideRoleCodes",
DROP COLUMN "paymentTargetDays";

-- DropTable
DROP TABLE "BudgetAllocation";

-- DropTable
DROP TABLE "BudgetCommitment";

