-- 615-C2 as narrowed (BD-613-91, ADR 0019 Amendment 1): the one writer of REGISTRATION_CANCELLED records a registration
-- body's cancellation as a fact (the body, its label frozen, the body's reference) and withdraws one recorded in error
-- (reason, officer, the row kept). The body's notice is attached on the record (DocumentAttachment.standingEventId).

-- Pre-check: no REGISTRATION_CANCELLED row exists (nothing has written one), so the new CHECK cannot fail on an old row.
SELECT CAST((SELECT 'Pre-check failed: a StandingEvent of kind REGISTRATION_CANCELLED already exists, but nothing has written one before this migration. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "StandingEvent" WHERE "kind" = 'REGISTRATION_CANCELLED')) AS INTEGER);

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "standingEventId" TEXT;

-- AlterTable
ALTER TABLE "StandingEvent" ADD COLUMN     "bodyLabelSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cancellingBodyId" TEXT,
ADD COLUMN     "externalReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnByPersonId" TEXT,
ADD COLUMN     "withdrawnReason" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "DocumentAttachment_standingEventId_idx" ON "DocumentAttachment"("standingEventId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_standingEventId_fkey" FOREIGN KEY ("standingEventId") REFERENCES "StandingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_cancellingBodyId_fkey" FOREIGN KEY ("cancellingBodyId") REFERENCES "RegistrationBody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_withdrawnByPersonId_fkey" FOREIGN KEY ("withdrawnByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A registration cancelled names its body and the body's reference, and only it does.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_cancellation_source"
  CHECK (("kind" = 'REGISTRATION_CANCELLED') = ("cancellingBodyId" IS NOT NULL)
    AND ("kind" = 'REGISTRATION_CANCELLED' OR ("bodyLabelSnapshot" = '' AND "externalReference" = ''))
    AND ("kind" <> 'REGISTRATION_CANCELLED' OR (length(btrim("bodyLabelSnapshot")) > 0 AND length(btrim("externalReference")) > 0)));

-- Withdrawn: only a registration cancelled, the day, the officer and a reason together.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_withdrawn"
  CHECK (("withdrawnAt" IS NULL) = ("withdrawnByPersonId" IS NULL)
    AND (("withdrawnAt" IS NULL) = ("withdrawnReason" = ''))
    AND ("withdrawnAt" IS NULL OR ("kind" = 'REGISTRATION_CANCELLED' AND length(btrim("withdrawnReason")) > 0)));

-- X-6: the record of a registration cancelled is an attachment owner (the body's notice). Both owner CHECKs rebuilt from the full owner list.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'WITHDRAWAL_LETTER' AND "bidWithdrawalId" IS NOT NULL)
    OR ("purpose" = 'VALIDITY_CONSENT' AND "validityExtensionId" IS NOT NULL)
    OR ("purpose" = 'SIGNED_SCHEDULE' AND "openingId" IS NOT NULL)
    OR ("purpose" IN ('REPORT_DRAWINGS', 'SIGNED_REPORT', 'SIGNED_PROPOSAL_PAPER') AND "evaluationId" IS NOT NULL)
    OR ("purpose" IN ('MEETING_MINUTES', 'TENDERER_CONFIRMATION') AND "evaluationMeetingId" IS NOT NULL)
    OR ("purpose" IN ('CPR_REPORT', 'COMMUNICATION') AND "evaluationBidderId" IS NOT NULL)
    OR ("purpose" = 'SUPPLIER_DOCUMENT' AND "supplierDocumentId" IS NOT NULL)
    OR ("purpose" IN ('SUPPLIER_DECLARATION', 'SUPPLIER_EPAYMENT_FORM') AND "supplierApplicationId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
    OR ("purpose" IN ('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO') AND "contractId" IS NOT NULL)
    OR ("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL)
    OR ("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL)
  );
