-- Close-out stage A review M3: one interim certificate applies every approved waiver it reaches, so a certificate carries
-- several waivers. The unique index refused the second (every interim on that contract was then refused). A plain index
-- keeps the lookup.

-- DropIndex
DROP INDEX "LadWaiver_appliedOnCertificateId_key";

-- CreateIndex
CREATE INDEX "LadWaiver_appliedOnCertificateId_idx" ON "LadWaiver"("appliedOnCertificateId");
