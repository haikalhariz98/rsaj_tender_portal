-- CreateEnum
CREATE TYPE "NumberingReset" AS ENUM ('NEVER', 'CALENDAR_YEAR', 'FINANCIAL_YEAR');

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "costCentreCode" TEXT NOT NULL,
    "accountCodeCode" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetCommitment" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL,
    "committedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedOn" TIMESTAMP(3),
    "releaseNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BudgetCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberingSeries" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 3,
    "resetOn" "NumberingReset" NOT NULL DEFAULT 'CALENDAR_YEAR',
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "nextSerial" INTEGER NOT NULL DEFAULT 1,
    "serialPeriod" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "NumberingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentClass" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "retentionMonths" INTEGER,
    "controlledCopy" BOOLEAN NOT NULL DEFAULT false,
    "releaseNeedsApproval" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "formCode" TEXT NOT NULL DEFAULT '',
    "revisionDate" TIMESTAMP(3),
    "bilingual" BOOLEAN NOT NULL DEFAULT false,
    "documentClassId" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "recipientRoleCodes" TEXT[],
    "reminderOffsetDays" INTEGER[],
    "escalatesToRoleCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetAllocation_organisationId_effectiveFrom_idx" ON "BudgetAllocation"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "BudgetAllocation_organisationId_costCentreCode_accountCodeC_idx" ON "BudgetAllocation"("organisationId", "costCentreCode", "accountCodeCode");

-- CreateIndex
CREATE INDEX "BudgetCommitment_allocationId_idx" ON "BudgetCommitment"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "NumberingSeries_organisationId_key_key" ON "NumberingSeries"("organisationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentClass_organisationId_code_key" ON "DocumentClass"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_organisationId_code_key" ON "DocumentTemplate"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_organisationId_eventKey_key" ON "NotificationRule"("organisationId", "eventKey");

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCommitment" ADD CONSTRAINT "BudgetCommitment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "BudgetAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NumberingSeries" ADD CONSTRAINT "NumberingSeries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentClass" ADD CONSTRAINT "DocumentClass_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_documentClassId_fkey" FOREIGN KEY ("documentClassId") REFERENCES "DocumentClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
