-- CreateEnum
CREATE TYPE "DelegationVariant" AS ENUM ('CONVENTIONAL', 'DESIGN_AND_BUILD');

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "delegationVariant" "DelegationVariant";
