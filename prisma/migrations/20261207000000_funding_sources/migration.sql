-- Phase 1 Sukuk core (ADR 0046): the funding source, its project categories, a contract's split and impact figures.
-- Additive only. Two nullable requisition columns, five new tables, no backfill, nothing on FundingRoute, Contract or Certificate.
-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN     "fundingSourceId" TEXT,
ADD COLUMN     "projectCategoryCode" TEXT;

-- CreateTable
CREATE TABLE "FundingSource" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "envelope" DECIMAL(18,2),
    "categoriesRestricted" BOOLEAN,
    "eligibleCategoryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eligibilityProvenance" "Provenance",
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "FundingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCategory" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ProjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingAllocation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fundingSourceId" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactMeasure" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ImpactMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectImpact" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "measureId" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectImpact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingSource_organisationId_sortOrder_idx" ON "FundingSource"("organisationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FundingSource_organisationId_code_key" ON "FundingSource"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCategory_organisationId_code_key" ON "ProjectCategory"("organisationId", "code");

-- CreateIndex
CREATE INDEX "FundingAllocation_fundingSourceId_idx" ON "FundingAllocation"("fundingSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingAllocation_contractId_fundingSourceId_key" ON "FundingAllocation"("contractId", "fundingSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ImpactMeasure_organisationId_code_key" ON "ImpactMeasure"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectImpact_contractId_measureId_key" ON "ProjectImpact"("contractId", "measureId");

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES "FundingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingSource" ADD CONSTRAINT "FundingSource_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCategory" ADD CONSTRAINT "ProjectCategory_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES "FundingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactMeasure" ADD CONSTRAINT "ImpactMeasure_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectImpact" ADD CONSTRAINT "ProjectImpact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectImpact" ADD CONSTRAINT "ProjectImpact_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectImpact" ADD CONSTRAINT "ProjectImpact_measureId_fkey" FOREIGN KEY ("measureId") REFERENCES "ImpactMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- FS-7, FS-10, FS-12 (hand-written): an envelope is never negative, a share is more than 0 and at most 100, an impact figure is never negative.
ALTER TABLE "FundingSource" ADD CONSTRAINT "FundingSource_envelope_not_negative" CHECK ("envelope" IS NULL OR "envelope" >= 0);
ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_share_range" CHECK ("sharePct" > 0 AND "sharePct" <= 100);
ALTER TABLE "ProjectImpact" ADD CONSTRAINT "ProjectImpact_value_not_negative" CHECK ("value" >= 0);
