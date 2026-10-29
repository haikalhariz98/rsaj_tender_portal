-- Close-out stage C review, ruling 4 (FR-FIN-011, ADR 0025 B1): what each live nominated party or assignee is due on the final account, a total
-- only, keyed while the account is a draft. Additive: a new table, nothing existing changes.

-- CreateTable
CREATE TABLE "FinalPartyLine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "finalAccountId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "due" DECIMAL(18,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalPartyLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinalPartyLine_partyId_idx" ON "FinalPartyLine"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinalPartyLine_finalAccountId_partyId_key" ON "FinalPartyLine"("finalAccountId", "partyId");

-- AddForeignKey
ALTER TABLE "FinalPartyLine" ADD CONSTRAINT "FinalPartyLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPartyLine" ADD CONSTRAINT "FinalPartyLine_finalAccountId_fkey" FOREIGN KEY ("finalAccountId") REFERENCES "FinalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalPartyLine" ADD CONSTRAINT "FinalPartyLine_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ContractParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- What a party is due is a total, never below nothing (the waterfall refuses DUE_NEGATIVE as well).
ALTER TABLE "FinalPartyLine" ADD CONSTRAINT "FinalPartyLine_due_not_negative" CHECK ("due" >= 0);
