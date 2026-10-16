-- Wave 3b step 15 (SR-13, ADR 0036 D10, review N3): an online bid file moved into the document store.
--   1. DocumentAttachment gains its owner key onlineBidFileId (unique, a file is stored once) and the two owner CHECKs are rebuilt from the full list (X-6).
--   2. DocumentStorePolicy gains the class a moved file takes. Null means not set, and an online opening cannot be finalised until it is.
--   3. Trigger 5's function sealed_online_bid_file_change is replaced whole: releasedDek may now go from a value to NULL once the file's document link exists.
--      Every other arm is as migration 20261103200000 wrote it. A shred before the link exists, and a change from one value to another, are still refused (PA015).

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "onlineBidFileId" TEXT;

-- AlterTable
ALTER TABLE "DocumentStorePolicy" ADD COLUMN     "onlineBidFileClassId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAttachment_onlineBidFileId_key" ON "DocumentAttachment"("onlineBidFileId");

-- AddForeignKey
ALTER TABLE "DocumentStorePolicy" ADD CONSTRAINT "DocumentStorePolicy_onlineBidFileClassId_fkey" FOREIGN KEY ("onlineBidFileClassId") REFERENCES "DocumentClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_onlineBidFileId_fkey" FOREIGN KEY ("onlineBidFileId") REFERENCES "OnlineBidFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attachment owners: both CHECKs rebuilt from the full list, with the online bid file. Every other line is as 20261013100000 left it.
-- Pre-check (the SELECT CAST pattern): nothing carries the new purpose, because the value was added by the migration just before this one.
SELECT CAST((SELECT 'Pre-check failed: an attachment already has the purpose ONLINE_BID_FILE, but nothing writes one before this migration. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "DocumentAttachment" WHERE "purpose" = 'ONLINE_BID_FILE')) AS INTEGER);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId", "onlineBidFileId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" IN ('SIGNED_MINUTES', 'SITTING_MINUTES') AND "meetingId" IS NOT NULL)
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
    OR ("purpose" = 'SUPPLIER_DRAFT_DOCUMENT' AND "registrationDraftDocumentId" IS NOT NULL)
    OR ("purpose" = 'SUPPLIER_BANK_STATEMENT' AND "creditorProfileId" IS NOT NULL)
    OR ("purpose" = 'ONLINE_BID_FILE' AND "onlineBidFileId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
    OR ("purpose" IN ('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO') AND "contractId" IS NOT NULL)
    OR ("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL)
    OR ("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL)
    OR ("purpose" = 'DELAY_NOTICE' AND "delayNoticeId" IS NOT NULL)
    OR ("purpose" IN ('METEOROLOGICAL_RECORD', 'EOT_CALCULATION') AND "eotClaimId" IS NOT NULL)
  );

-- Trigger 5 on OnlineBidFile (replaces sealed_online_bid_file_change, whole). The search_path and the finalisedXact reading are as 20261103200000 wrote them.
CREATE OR REPLACE FUNCTION public."sealed_online_bid_file_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['state', 'releasedDek']) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a bid file''s ciphertext, sealed key, metadata and identity never change', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D12, S8. Ciphertext is immutable.';
  END IF;
  IF NEW."state" IS DISTINCT FROM OLD."state" AND (OLD."state" <> 'DRAFT' OR NEW."state" NOT IN ('SUBMITTED', 'DISCARDED')) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % from % to % is refused: a draft is taken by a submission or discarded, once', OLD."id", OLD."state", NEW."state"
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D5.';
  END IF;
  IF NEW."releasedDek" IS DISTINCT FROM OLD."releasedDek" THEN
    IF OLD."releasedDek" IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public."OnlineBidPart" p
                       JOIN public."OnlineBid" b ON b."id" = p."onlineBidId"
                       JOIN public."OpenedBid" ob ON ob."envelopeId" = b."envelopeId"
                       JOIN public."Opening" o ON o."id" = ob."openingId"
                     WHERE p."fileId" = NEW."id" AND b."status" = 'OPENED' AND o."finalisedAt" IS NOT NULL AND o."finalisedXact" = pg_current_xact_id()) THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a data key is released only while its opening is being finalised', OLD."id"
          USING ERRCODE = 'PA015', HINT = 'ADR 0036 D10, M5, security audit 2. The finalise sets finalisedAt first, then the released keys.';
      END IF;
    ELSIF NEW."releasedDek" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public."DocumentAttachment" a WHERE a."onlineBidFileId" = OLD."id") THEN
      -- The shred waits for the file's document link. Set to NULL once it exists is the only change a released key may make, and set to another value never.
      RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a released data key is shredded only once the file''s document link exists', OLD."id"
        USING ERRCODE = 'PA015', HINT = 'ADR 0036 D10, M5. The mover writes the link, then shreds the key.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
