-- Phase 2b (ADR 0034 D12, NFR-SIG-001, NFR-AUD-005 and 006): two things an attribution must also say.
--
-- 1. A signature-class act records the exact document or record it signed, and the office the signer held (NFR-SIG-001).
-- 2. The server stamps the time of an act (the existing "at"), and a signed act dated earlier than the day it is recorded is a recorded exception:
--    the day it is dated, why, and the person who authorised it (NFR-AUD-006). The authoriser is a column of the attribution, and not a slot of the
--    act: it is part of how the act was recorded, and it is attributed with the row.
--
-- Additive. The table is append-only (migration 20261007130200): adding columns with a default fires no row trigger, and no existing row is changed. No act
-- has been attributed before this phase, so every existing row, if there is one, takes the empty values and satisfies the CHECKs below.
-- Every CHECK is written so that an unknown (NULL) refuses rather than passes.

-- AlterTable
ALTER TABLE "ActAttribution" ADD COLUMN     "backdateAuthorisedByPersonId" TEXT,
ADD COLUMN     "backdateReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "documentEntity" TEXT,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "effectiveOn" DATE,
ADD COLUMN     "roleCode" TEXT;

-- AddForeignKey
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_backdateAuthorisedByPersonId_fkey" FOREIGN KEY ("backdateAuthorisedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The document is named by its model and its id together, or not at all.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_document_named" CHECK (
  ("documentEntity" IS NULL AND "documentId" IS NULL)
  OR (COALESCE(btrim("documentEntity") <> '' AND btrim("documentId") <> '', false))
);
-- A role held is a code, never blank.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_role_named" CHECK ("roleCode" IS NULL OR btrim("roleCode") <> '');
-- Back-dating is a reason, an authoriser and the day it is dated, all together, on a signed act, and the authoriser is someone other than the person who recorded it.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_backdate_held" CHECK (
  (btrim("backdateReason") = '' AND "backdateAuthorisedByPersonId" IS NULL)
  OR (
    btrim("backdateReason") <> ''
    AND "backdateAuthorisedByPersonId" IS NOT NULL
    AND "effectiveOn" IS NOT NULL
    AND "mode" = 'SIGNED'
    AND "backdateAuthorisedByPersonId" IS DISTINCT FROM "recordedByPersonId"
  )
);
