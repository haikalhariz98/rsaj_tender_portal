-- CreateTable
CREATE TABLE "FundingRoute" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "organisationProcures" BOOLEAN NOT NULL DEFAULT true,
    "routeDecidedExternally" BOOLEAN NOT NULL DEFAULT false,
    "supersedesAuthority" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL DEFAULT '',
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "FundingRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingMethod" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "availableInTender" BOOLEAN NOT NULL DEFAULT false,
    "availableInQuotation" BOOLEAN NOT NULL DEFAULT false,
    "availableBelow" BOOLEAN NOT NULL DEFAULT false,
    "requiresAdvertisement" BOOLEAN NOT NULL DEFAULT false,
    "invitesNamedSuppliers" BOOLEAN NOT NULL DEFAULT false,
    "requiresFreshSourcing" BOOLEAN NOT NULL DEFAULT true,
    "awardInstrument" TEXT NOT NULL DEFAULT '',
    "committeeCode" TEXT,
    "authorityMethodKey" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "SourcingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractType" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "ContractType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingRoute_organisationId_sortOrder_idx" ON "FundingRoute"("organisationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FundingRoute_organisationId_code_key" ON "FundingRoute"("organisationId", "code");

-- CreateIndex
CREATE INDEX "SourcingMethod_organisationId_sortOrder_idx" ON "SourcingMethod"("organisationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingMethod_organisationId_code_key" ON "SourcingMethod"("organisationId", "code");

-- CreateIndex
CREATE INDEX "ContractType_organisationId_sortOrder_idx" ON "ContractType"("organisationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ContractType_organisationId_code_key" ON "ContractType"("organisationId", "code");

-- AddForeignKey
ALTER TABLE "FundingRoute" ADD CONSTRAINT "FundingRoute_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingMethod" ADD CONSTRAINT "SourcingMethod_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractType" ADD CONSTRAINT "ContractType_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
