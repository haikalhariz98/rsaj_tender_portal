-- CreateEnum
CREATE TYPE "SumAdjustmentTrigger" AS ENUM ('VARIATION', 'LOSS_AND_EXPENSE', 'REMEASUREMENT', 'PC_AND_PROVISIONAL_SUMS', 'PRICE_FLUCTUATION');

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "sumAdjustmentTriggers" "SumAdjustmentTrigger"[] DEFAULT ARRAY[]::"SumAdjustmentTrigger"[];
