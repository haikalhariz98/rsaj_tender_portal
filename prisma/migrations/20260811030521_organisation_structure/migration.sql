-- CreateEnum
CREATE TYPE "OrgUnitKind" AS ENUM ('COMPANY', 'DIVISION', 'DEPARTMENT', 'SECTION');

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "kind" "OrgUnitKind" NOT NULL,
    "parentCode" TEXT,
    "costCentreCode" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCentre" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "CostCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCode" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "AccountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "orgUnitCode" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeFormat" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "example" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',

    CONSTRAINT "CodeFormat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgUnit_organisationId_effectiveFrom_idx" ON "OrgUnit"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "OrgUnit_organisationId_parentCode_idx" ON "OrgUnit"("organisationId", "parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_organisationId_code_effectiveFrom_key" ON "OrgUnit"("organisationId", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CostCentre_organisationId_effectiveFrom_idx" ON "CostCentre"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CostCentre_organisationId_code_effectiveFrom_key" ON "CostCentre"("organisationId", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "AccountCode_organisationId_effectiveFrom_idx" ON "AccountCode"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCode_organisationId_code_effectiveFrom_key" ON "AccountCode"("organisationId", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Site_organisationId_effectiveFrom_idx" ON "Site"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organisationId_code_effectiveFrom_key" ON "Site"("organisationId", "code", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CodeFormat_organisationId_key_key" ON "CodeFormat"("organisationId", "key");

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCentre" ADD CONSTRAINT "CostCentre_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCode" ADD CONSTRAINT "AccountCode_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFormat" ADD CONSTRAINT "CodeFormat_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
