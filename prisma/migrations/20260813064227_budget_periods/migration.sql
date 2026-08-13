-- CreateTable
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "openedOn" TIMESTAMP(3),
    "closedOn" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetYear" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rollUnspentForward" BOOLEAN,

    CONSTRAINT "BudgetYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetPeriod_organisationId_year_idx" ON "BudgetPeriod"("organisationId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriod_organisationId_year_code_key" ON "BudgetPeriod"("organisationId", "year", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetYear_organisationId_year_key" ON "BudgetYear"("organisationId", "year");

-- AddForeignKey
ALTER TABLE "BudgetPeriod" ADD CONSTRAINT "BudgetPeriod_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetYear" ADD CONSTRAINT "BudgetYear_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
