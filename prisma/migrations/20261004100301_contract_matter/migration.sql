-- 6.13 Part B run 1a (ADR 0029, OD-B5 A, BD-613-73): a post-award matter decided on an approval route is one record,
-- ContractMatter, owning its routes and the committee matters tabled from it. MatterKind CONTRACT existed unused.

-- Pre-check (the SELECT CAST pattern): no approval route and no committee matter is a CONTRACT matter yet, so the two
-- CHECKs below hold for every existing row. Fails with the message as the error, and nothing is changed, if one is.
SELECT CAST((SELECT 'Pre-check failed: an approval route or a committee matter is already a CONTRACT matter, so ApprovalInstance_contract_matter and CommitteeDecision_contract_matter cannot be added. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ApprovalInstance" WHERE "matterKind" = 'CONTRACT') OR EXISTS (SELECT 1 FROM "CommitteeDecision" WHERE "matterKind" = 'CONTRACT')) AS INTEGER);

-- CreateEnum
CREATE TYPE "ContractMatterKind" AS ENUM ('EOT', 'PERIOD_EXTENSION', 'LAD_WAIVER', 'TERMINATION', 'NOMINATED_INCREASE', 'NOMINATION', 'LOSS_EXPENSE');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "contractMatterId" TEXT;

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "contractMatterId" TEXT;

-- CreateTable
CREATE TABLE "ContractMatter" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "ContractMatterKind" NOT NULL,
    "reference" TEXT,
    "routedValue" DECIMAL(18,2),
    "ratioNum" DECIMAL(18,2),
    "ratioDen" DECIMAL(18,2),
    "cond" TEXT,
    "approvedRouteId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT NOT NULL DEFAULT '',
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMatter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractMatter_approvedRouteId_key" ON "ContractMatter"("approvedRouteId");

-- CreateIndex
CREATE INDEX "ContractMatter_contractId_idx" ON "ContractMatter"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractMatter_organisationId_reference_key" ON "ContractMatter"("organisationId", "reference");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_contractMatterId_fkey" FOREIGN KEY ("contractMatterId") REFERENCES "ContractMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_contractMatterId_fkey" FOREIGN KEY ("contractMatterId") REFERENCES "ContractMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMatter" ADD CONSTRAINT "ContractMatter_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMatter" ADD CONSTRAINT "ContractMatter_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMatter" ADD CONSTRAINT "ContractMatter_approvedRouteId_fkey" FOREIGN KEY ("approvedRouteId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMatter" ADD CONSTRAINT "ContractMatter_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- By hand: a CONTRACT route names its matter, and only a CONTRACT route does.
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_contract_matter" CHECK (("matterKind" = 'CONTRACT') = ("contractMatterId" IS NOT NULL));

-- A committee matter names a contract matter only where it is a CONTRACT matter.
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_contract_matter" CHECK ("contractMatterId" IS NULL OR "matterKind" = 'CONTRACT');

-- The matter's shape: a value never below nothing, the exact ratio both or neither with its denominator above nothing,
-- and a closed matter says why.
ALTER TABLE "ContractMatter" ADD CONSTRAINT "ContractMatter_shape" CHECK (
  ("routedValue" IS NULL OR "routedValue" >= 0)
  AND (("ratioNum" IS NULL) = ("ratioDen" IS NULL))
  AND ("ratioDen" IS NULL OR "ratioDen" > 0)
  AND ("ratioNum" IS NULL OR "ratioNum" >= 0)
  AND ("closedAt" IS NULL OR "closeReason" <> '')
);

-- One open termination matter a contract (partial: Prisma does not model it, as the other partial unique indexes).
CREATE UNIQUE INDEX "ContractMatter_one_open_termination" ON "ContractMatter"("contractId") WHERE "kind" = 'TERMINATION' AND "closedAt" IS NULL;
