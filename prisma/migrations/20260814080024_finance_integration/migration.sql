-- CreateTable
CREATE TABLE "FinanceIntegration" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "direction" TEXT,
    "schedule" TEXT,
    "varianceTolerance" DECIMAL(18,2),

    CONSTRAINT "FinanceIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSyncRun" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "direction" TEXT NOT NULL DEFAULT '',
    "recordsIn" INTEGER NOT NULL DEFAULT 0,
    "recordsOut" INTEGER NOT NULL DEFAULT 0,
    "problem" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FinanceSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceVariance" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "budgetCodeCode" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL DEFAULT '',
    "compares" TEXT NOT NULL DEFAULT '',
    "portalAmount" DECIMAL(18,2) NOT NULL,
    "financeAmount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "resolvedOn" TIMESTAMP(3),
    "resolvedNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FinanceVariance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceIntegration_organisationId_key" ON "FinanceIntegration"("organisationId");

-- CreateIndex
CREATE INDEX "FinanceSyncRun_organisationId_startedAt_idx" ON "FinanceSyncRun"("organisationId", "startedAt");

-- CreateIndex
CREATE INDEX "FinanceVariance_organisationId_lastSeenAt_idx" ON "FinanceVariance"("organisationId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "FinanceIntegration" ADD CONSTRAINT "FinanceIntegration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncRun" ADD CONSTRAINT "FinanceSyncRun_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVariance" ADD CONSTRAINT "FinanceVariance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
