-- Phase 2 close-out stage A (FR-EOT-006, design note 6.13B section 6.8): a 1.2 loss-and-expense line of an adjustment of
-- the contract sum names the approved claim it pays. The column is new: existing lines stay unlinked.

-- AlterTable
ALTER TABLE "SumAdjustmentLine" ADD COLUMN     "lossExpenseClaimId" TEXT;

-- CreateIndex
CREATE INDEX "SumAdjustmentLine_lossExpenseClaimId_idx" ON "SumAdjustmentLine"("lossExpenseClaimId");

-- AddForeignKey
ALTER TABLE "SumAdjustmentLine" ADD CONSTRAINT "SumAdjustmentLine_lossExpenseClaimId_fkey" FOREIGN KEY ("lossExpenseClaimId") REFERENCES "LossExpenseClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only a loss-and-expense line names a claim (by hand)
ALTER TABLE "SumAdjustmentLine" ADD CONSTRAINT "SumAdjustmentLine_loss_expense" CHECK ("lossExpenseClaimId" IS NULL OR "trigger" = 'LOSS_AND_EXPENSE');
