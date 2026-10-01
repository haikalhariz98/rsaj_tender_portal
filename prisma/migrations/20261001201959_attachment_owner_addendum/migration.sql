-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "addendumId" TEXT;

-- CreateIndex
CREATE INDEX "DocumentAttachment_addendumId_idx" ON "DocumentAttachment"("addendumId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_addendumId_fkey" FOREIGN KEY ("addendumId") REFERENCES "Addendum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the addendum
-- added for its signed copy, and the two exercise purposes of the window (6.5). Prisma does not
-- model CHECK constraints, so they live here, in attachFault, and in the schema-vs-CHECK test
-- (src/lib/documents/owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );
