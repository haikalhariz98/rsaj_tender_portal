-- AlterEnum
ALTER TYPE "ContractNumberSource" ADD VALUE 'QUOTATION_NUMBER';

-- AlterEnum
ALTER TYPE "QuotationContractKey" ADD VALUE 'QUOTATION_NUMBER';

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "quotationContractKey" "QuotationContractKey";

