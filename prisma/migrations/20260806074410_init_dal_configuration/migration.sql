-- CreateEnum
CREATE TYPE "AuthorityAct" AS ENUM ('P', 'JP', 'R', 'JR', 'MR', 'MJR', 'A', 'MA');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameMs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityRole" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT NOT NULL,
    "isCommittee" BOOLEAN NOT NULL DEFAULT false,
    "escalatesToCode" TEXT,
    "selfApprovalEscalatesToCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuthorityRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DalVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "boundaryValue" DECIMAL(18,2) NOT NULL,
    "boundaryInclusive" BOOLEAN NOT NULL DEFAULT true,
    "quotationFloor" DECIMAL(18,2) NOT NULL,
    "tenderFloor" DECIMAL(18,2) NOT NULL,
    "requisitionBoundary" DECIMAL(18,2) NOT NULL,
    "splittingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'MYR',

    CONSTRAINT "DalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DalRule" (
    "id" TEXT NOT NULL,
    "dalVersionId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "method" TEXT,
    "cond" TEXT,
    "minValue" DECIMAL(18,2),
    "maxValue" DECIMAL(18,2),
    "pctMin" DECIMAL(9,4),
    "pctMax" DECIMAL(9,4),
    "contractValueMin" DECIMAL(18,2),
    "contractValueMax" DECIMAL(18,2),
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "proposerCode" TEXT,
    "approverCode" TEXT,
    "committeeCode" TEXT,
    "committeeAct" "AuthorityAct",
    "nonDelegable" BOOLEAN NOT NULL DEFAULT false,
    "approverMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isGap" BOOLEAN NOT NULL DEFAULT false,
    "gapNote" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "clause" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DalRuleRecommender" (
    "id" TEXT NOT NULL,
    "dalRuleId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "act" "AuthorityAct" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DalRuleRecommender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_code_key" ON "Organisation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityRole_organisationId_code_key" ON "AuthorityRole"("organisationId", "code");

-- CreateIndex
CREATE INDEX "DalVersion_organisationId_effectiveFrom_idx" ON "DalVersion"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "DalVersion_organisationId_label_key" ON "DalVersion"("organisationId", "label");

-- CreateIndex
CREATE INDEX "DalRule_dalVersionId_domain_method_idx" ON "DalRule"("dalVersionId", "domain", "method");

-- CreateIndex
CREATE UNIQUE INDEX "DalRule_dalVersionId_ruleKey_key" ON "DalRule"("dalVersionId", "ruleKey");

-- CreateIndex
CREATE INDEX "DalRuleRecommender_dalRuleId_idx" ON "DalRuleRecommender"("dalRuleId");

-- AddForeignKey
ALTER TABLE "AuthorityRole" ADD CONSTRAINT "AuthorityRole_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DalVersion" ADD CONSTRAINT "DalVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DalRule" ADD CONSTRAINT "DalRule_dalVersionId_fkey" FOREIGN KEY ("dalVersionId") REFERENCES "DalVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DalRuleRecommender" ADD CONSTRAINT "DalRuleRecommender_dalRuleId_fkey" FOREIGN KEY ("dalRuleId") REFERENCES "DalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
