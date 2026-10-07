-- Phase 1d (ADR 0034 D11): an organisation that has a trail can no longer be deleted with it.
-- The foreign key goes from CASCADE to RESTRICT. No row changes.

-- DropForeignKey
ALTER TABLE "AuditEntry" DROP CONSTRAINT "AuditEntry_organisationId_fkey";

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
