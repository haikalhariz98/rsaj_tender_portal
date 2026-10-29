-- Phase 2 close-out stage C (ADR 0047, plan closeout-plan.md section 6.2): the final account of the FINAL certificate, its lines, the
-- configured close-out documents and the pack that meets them, and the contract's close. CHECKs by hand at the end.
-- CreateEnum
CREATE TYPE "FinalBlock" AS ENUM ('LESS', 'DEDUCT');

-- CreateEnum
CREATE TYPE "FinalLineKind" AS ENUM ('PREVIOUS_INTERIM', 'RETENTION_RELEASED_MAIN', 'RETENTION_RELEASED_NSC', 'RETENTION_RELEASED_NS', 'ADVANCE_REPAID_MAIN', 'ADVANCE_REPAID_NSC', 'LAD', 'LAD_WAIVED', 'LAD_CREDIT', 'LAD_ROUNDING', 'PREMIUMS_PERKESO', 'WAGES', 'NON_COMPLIANCE', 'MAKING_GOOD_COST', 'DIMINUTION', 'OTHER');

-- CreateTable
CREATE TABLE "FinalAccount" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "finalSum" DECIMAL(18,2) NOT NULL,
    "recommended" DECIMAL(18,2) NOT NULL,
    "previousBasis" "FinalPreviousBasis" NOT NULL,
    "judgedUnder" JSONB NOT NULL,
    "declarationDocumentId" TEXT,
    "financeConfirmedTotal" DECIMAL(18,2),
    "financeConfirmedByPersonId" TEXT,
    "financeConfirmedAt" TIMESTAMP(3),
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalAccountLine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "finalAccountId" TEXT NOT NULL,
    "block" "FinalBlock" NOT NULL,
    "kind" "FinalLineKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "label" TEXT NOT NULL,
    "sourceIds" JSONB NOT NULL,
    "keyed" BOOLEAN NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalAccountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseoutDocumentRequirement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "provenance" "Provenance" NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "CloseoutDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalPackEntry" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "finalAccountId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "projectDocumentId" TEXT,
    "notApplicableReason" TEXT NOT NULL DEFAULT '',
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalPackEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractClosure" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "closedOn" TIMESTAMP(3) NOT NULL,
    "preconditions" JSONB NOT NULL,
    "surviving" JSONB NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinalAccount_certificateId_key" ON "FinalAccount"("certificateId");

-- CreateIndex
CREATE INDEX "FinalAccount_contractId_idx" ON "FinalAccount"("contractId");

-- CreateIndex
CREATE INDEX "FinalAccountLine_finalAccountId_idx" ON "FinalAccountLine"("finalAccountId");

-- CreateIndex
CREATE INDEX "CloseoutDocumentRequirement_organisationId_idx" ON "CloseoutDocumentRequirement"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalPackEntry_finalAccountId_requirementId_key" ON "FinalPackEntry"("finalAccountId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractClosure_contractId_key" ON "ContractClosure"("contractId");

-- AddForeignKey
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_declarationDocumentId_fkey" FOREIGN KEY ("declarationDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_financeConfirmedByPersonId_fkey" FOREIGN KEY ("financeConfirmedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccountLine" ADD CONSTRAINT "FinalAccountLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalAccountLine" ADD CONSTRAINT "FinalAccountLine_finalAccountId_fkey" FOREIGN KEY ("finalAccountId") REFERENCES "FinalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseoutDocumentRequirement" ADD CONSTRAINT "CloseoutDocumentRequirement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPackEntry" ADD CONSTRAINT "FinalPackEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPackEntry" ADD CONSTRAINT "FinalPackEntry_finalAccountId_fkey" FOREIGN KEY ("finalAccountId") REFERENCES "FinalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPackEntry" ADD CONSTRAINT "FinalPackEntry_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "CloseoutDocumentRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPackEntry" ADD CONSTRAINT "FinalPackEntry_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPackEntry" ADD CONSTRAINT "FinalPackEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClosure" ADD CONSTRAINT "ContractClosure_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClosure" ADD CONSTRAINT "ContractClosure_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClosure" ADD CONSTRAINT "ContractClosure_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- FR-FIN-004: Finance's confirmation is the total, who confirmed it and when, all three or none.
ALTER TABLE "FinalAccount" ADD CONSTRAINT "FinalAccount_finance_confirmed_together" CHECK (
  ("financeConfirmedTotal" IS NULL AND "financeConfirmedByPersonId" IS NULL AND "financeConfirmedAt" IS NULL)
  OR ("financeConfirmedTotal" IS NOT NULL AND "financeConfirmedByPersonId" IS NOT NULL AND "financeConfirmedAt" IS NOT NULL)
);

-- The block follows the kind: what was paid before is less, and damages and the deductions are deducted.
ALTER TABLE "FinalAccountLine" ADD CONSTRAINT "FinalAccountLine_block_of_kind" CHECK (
  ("block" = 'LESS') = ("kind" IN ('PREVIOUS_INTERIM', 'RETENTION_RELEASED_MAIN', 'RETENTION_RELEASED_NSC', 'RETENTION_RELEASED_NS', 'ADVANCE_REPAID_MAIN', 'ADVANCE_REPAID_NSC'))
);

-- A keyed line is one of the keyed deductions, and making-good costs and diminution in value are only ever keyed (no interim carries them).
ALTER TABLE "FinalAccountLine" ADD CONSTRAINT "FinalAccountLine_keyed_kind" CHECK (
  (NOT "keyed" OR "kind" IN ('PREMIUMS_PERKESO', 'WAGES', 'NON_COMPLIANCE', 'MAKING_GOOD_COST', 'DIMINUTION', 'OTHER', 'LAD_ROUNDING'))
  AND ("keyed" OR "kind" NOT IN ('MAKING_GOOD_COST', 'DIMINUTION'))
);

-- BD-613-47: a keyed rounding on the damages lies strictly between -RM1.00 and RM1.00.
ALTER TABLE "FinalAccountLine" ADD CONSTRAINT "FinalAccountLine_rounding_range" CHECK (
  NOT ("keyed" AND "kind" = 'LAD_ROUNDING') OR ("amount" > -1.00 AND "amount" < 1.00)
);

-- A pack entry is met by a document or marked not applicable with a reason: exactly one.
ALTER TABLE "FinalPackEntry" ADD CONSTRAINT "FinalPackEntry_document_or_reason" CHECK (
  ("projectDocumentId" IS NOT NULL) <> (btrim("notApplicableReason") <> '')
);
