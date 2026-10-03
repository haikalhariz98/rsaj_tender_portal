-- CreateTable
CREATE TABLE "OpeningPosition" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "lastCertificateNumber" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL,
    "grossToDate" DECIMAL(18,2) NOT NULL,
    "grossProvenance" "Provenance" NOT NULL,
    "grossNote" TEXT NOT NULL,
    "previouslyCertified" DECIMAL(18,2) NOT NULL,
    "previousProvenance" "Provenance" NOT NULL,
    "previousNote" TEXT NOT NULL,
    "retentionMain" DECIMAL(18,2) NOT NULL,
    "retentionNsc" DECIMAL(18,2) NOT NULL,
    "retentionNs" DECIMAL(18,2) NOT NULL,
    "retentionProvenance" "Provenance" NOT NULL,
    "retentionNote" TEXT NOT NULL,
    "releasedMain" DECIMAL(18,2) NOT NULL,
    "releasedNsc" DECIMAL(18,2) NOT NULL,
    "releasedNs" DECIMAL(18,2) NOT NULL,
    "releasedProvenance" "Provenance" NOT NULL,
    "releasedNote" TEXT NOT NULL,
    "advanceRecouped" JSONB NOT NULL,
    "advanceProvenance" "Provenance" NOT NULL,
    "advanceNote" TEXT NOT NULL,
    "damagesChargedUntil" TIMESTAMP(3),
    "damagesProvenance" "Provenance" NOT NULL,
    "damagesNote" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpeningPosition_contractId_key" ON "OpeningPosition"("contractId");

-- AddForeignKey
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- BD-613-41 as amended: hand CHECKs. Each figure STATED or ASSUMED with its note, money never below nothing, released never above held, the sequence from 1.
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_sequence" CHECK ("lastSequence" >= 1 AND length(btrim("lastCertificateNumber")) > 0);
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_money" CHECK ("grossToDate" >= 0 AND "previouslyCertified" >= 0 AND "retentionMain" >= 0 AND "retentionNsc" >= 0 AND "retentionNs" >= 0 AND "releasedMain" >= 0 AND "releasedNsc" >= 0 AND "releasedNs" >= 0);
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_released" CHECK ("releasedMain" <= "retentionMain" AND "releasedNsc" <= "retentionNsc" AND "releasedNs" <= "retentionNs");
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_provenance" CHECK ("grossProvenance" IN ('STATED', 'ASSUMED') AND "previousProvenance" IN ('STATED', 'ASSUMED') AND "retentionProvenance" IN ('STATED', 'ASSUMED') AND "releasedProvenance" IN ('STATED', 'ASSUMED') AND "advanceProvenance" IN ('STATED', 'ASSUMED') AND "damagesProvenance" IN ('STATED', 'ASSUMED'));
ALTER TABLE "OpeningPosition" ADD CONSTRAINT "OpeningPosition_notes" CHECK (length(btrim("grossNote")) > 0 AND length(btrim("previousNote")) > 0 AND length(btrim("retentionNote")) > 0 AND length(btrim("releasedNote")) > 0 AND length(btrim("advanceNote")) > 0 AND length(btrim("damagesNote")) > 0);
