-- CreateEnum
CREATE TYPE "ChainStepOrigin" AS ENUM ('CORE', 'CORE_STRENGTHENED', 'CORE_ACT_SET', 'RULE');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "coreChainFlag" BOOLEAN,
ADD COLUMN     "coreChainReason" TEXT,
ADD COLUMN     "coreRoutingSnapshot" JSONB,
ADD COLUMN     "coreSnapshotAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "chainOrigin" "ChainStepOrigin";

-- AlterTable
ALTER TABLE "AuthorityRule" ADD COLUMN     "coreChainReason" TEXT,
ADD COLUMN     "generateCoreChain" BOOLEAN;

-- CreateTable
CREATE TABLE "CoreRoutingLevel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "authorityMatrixId" TEXT NOT NULL,
    "approverCode" TEXT NOT NULL,
    "clause" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CoreRoutingLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoreRoutingStep" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "coreRoutingLevelId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "act" "AuthorityAct" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CoreRoutingStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoreRoutingLevel_organisationId_idx" ON "CoreRoutingLevel"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CoreRoutingLevel_authorityMatrixId_approverCode_key" ON "CoreRoutingLevel"("authorityMatrixId", "approverCode");

-- CreateIndex
CREATE INDEX "CoreRoutingStep_organisationId_idx" ON "CoreRoutingStep"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CoreRoutingStep_coreRoutingLevelId_sequence_key" ON "CoreRoutingStep"("coreRoutingLevelId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CoreRoutingStep_coreRoutingLevelId_roleCode_key" ON "CoreRoutingStep"("coreRoutingLevelId", "roleCode");

-- AddForeignKey
ALTER TABLE "CoreRoutingLevel" ADD CONSTRAINT "CoreRoutingLevel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreRoutingLevel" ADD CONSTRAINT "CoreRoutingLevel_authorityMatrixId_fkey" FOREIGN KEY ("authorityMatrixId") REFERENCES "AuthorityMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreRoutingStep" ADD CONSTRAINT "CoreRoutingStep_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreRoutingStep" ADD CONSTRAINT "CoreRoutingStep_coreRoutingLevelId_fkey" FOREIGN KEY ("coreRoutingLevelId") REFERENCES "CoreRoutingLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
