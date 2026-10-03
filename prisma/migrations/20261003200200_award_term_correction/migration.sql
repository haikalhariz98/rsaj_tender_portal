-- CreateEnum
CREATE TYPE "AwardTerm" AS ENUM ('LAD', 'DLP', 'RETENTION', 'COMPLETION');

-- CreateTable
CREATE TABLE "AwardTermCorrection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "term" "AwardTerm" NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "beforeText" TEXT NOT NULL,
    "afterText" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardTermCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardTermCorrection_baselineId_key" ON "AwardTermCorrection"("baselineId");

-- CreateIndex
CREATE INDEX "AwardTermCorrection_awardId_idx" ON "AwardTermCorrection"("awardId");

-- CreateIndex
CREATE INDEX "AwardTermCorrection_contractId_idx" ON "AwardTermCorrection"("contractId");

-- AddForeignKey
ALTER TABLE "AwardTermCorrection" ADD CONSTRAINT "AwardTermCorrection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardTermCorrection" ADD CONSTRAINT "AwardTermCorrection_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardTermCorrection" ADD CONSTRAINT "AwardTermCorrection_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardTermCorrection" ADD CONSTRAINT "AwardTermCorrection_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ContractBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
