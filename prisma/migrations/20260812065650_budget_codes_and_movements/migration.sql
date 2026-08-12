-- CreateEnum
CREATE TYPE "BudgetMovementKind" AS ENUM ('ORIGINAL', 'REVISION', 'TRANSFER_IN', 'TRANSFER_OUT', 'COMMITMENT', 'ACTUAL_SPEND');

-- CreateTable
CREATE TABLE "BudgetCode" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionMs" TEXT,
    "type" TEXT NOT NULL DEFAULT '',
    "owningUnitCode" TEXT,
    "accountCode" TEXT NOT NULL DEFAULT '',
    "holderPersonId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "BudgetCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMovement" (
    "id" TEXT NOT NULL,
    "budgetCodeId" TEXT NOT NULL,
    "kind" "BudgetMovementKind" NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2) NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "releasedOn" TIMESTAMP(3),
    "releaseNote" TEXT NOT NULL DEFAULT '',
    "counterpartCode" TEXT,

    CONSTRAINT "BudgetMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetSettings" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "availabilityCheck" TEXT,
    "warningThresholdPercent" INTEGER,
    "overCommitmentTolerancePercent" INTEGER,
    "commitOnApproval" BOOLEAN,
    "overrideRoleCodes" TEXT[],
    "advanceRecoupmentRatePercent" INTEGER,
    "minimumInterimCertificate" DECIMAL(18,2),
    "paymentTargetDays" INTEGER,

    CONSTRAINT "BudgetSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetCode_organisationId_effectiveFrom_idx" ON "BudgetCode"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCode_organisationId_code_key" ON "BudgetCode"("organisationId", "code");

-- CreateIndex
CREATE INDEX "BudgetMovement_budgetCodeId_kind_idx" ON "BudgetMovement"("budgetCodeId", "kind");

-- CreateIndex
CREATE INDEX "BudgetMovement_budgetCodeId_occurredOn_idx" ON "BudgetMovement"("budgetCodeId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetSettings_organisationId_key" ON "BudgetSettings"("organisationId");

-- AddForeignKey
ALTER TABLE "BudgetCode" ADD CONSTRAINT "BudgetCode_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCode" ADD CONSTRAINT "BudgetCode_holderPersonId_fkey" FOREIGN KEY ("holderPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMovement" ADD CONSTRAINT "BudgetMovement_budgetCodeId_fkey" FOREIGN KEY ("budgetCodeId") REFERENCES "BudgetCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSettings" ADD CONSTRAINT "BudgetSettings_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
