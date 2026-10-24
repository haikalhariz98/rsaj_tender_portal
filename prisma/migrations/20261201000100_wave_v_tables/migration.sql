-- ADR 0045 (wave V plan step V1, migration B of two): the online award return, the contractor's questions on an issued award, and Finance's payment of a
-- supply claim. Additive only: three new tables, three new nullable columns, the attachment owner CHECKs and the staff notice CHECK replaced whole so that
-- more is allowed (every existing row already satisfies each), one new CHECK on the legacy submission, the project file's one-pin index and kept-file
-- trigger widened from its purpose to its owner, and the triggers that keep the new rows. No existing row is written, changed or deleted. The enum values
-- these name arrived in the earlier folder (20261201000000_wave_v_enums).

-- AlterTable
ALTER TABLE "ContractType" ADD COLUMN     "paymentRoute" "PaymentRoute";

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "awardOnlineReturnId" TEXT;

-- AlterTable
ALTER TABLE "DocumentStorePolicy" ADD COLUMN     "awardReturnClassId" TEXT;

-- CreateTable
CREATE TABLE "AwardOnlineReturn" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "submittedBySupplierAccountId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "stepUpAt" TIMESTAMP(3) NOT NULL,
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "icNumber" TEXT NOT NULL DEFAULT '',
    "occupation" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "capacity" TEXT NOT NULL DEFAULT '',
    "witnessName" TEXT NOT NULL DEFAULT '',
    "contractorSigned" BOOLEAN,
    "stampAffixed" BOOLEAN,
    "witnessSigned" BOOLEAN,
    "verifiedByPersonId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "refusedByPersonId" TEXT,
    "refusedAt" TIMESTAMP(3),
    "refusedReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AwardOnlineReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardQuery" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "askedBySupplierAccountId" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "answeredByPersonId" TEXT,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "AwardQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyInvoicePayment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "batchNo" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AwardOnlineReturn_awardId_idx" ON "AwardOnlineReturn"("awardId");

-- CreateIndex
CREATE INDEX "AwardQuery_awardId_askedAt_idx" ON "AwardQuery"("awardId", "askedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyInvoicePayment_documentId_key" ON "SupplyInvoicePayment"("documentId");

-- CreateIndex
CREATE INDEX "SupplyInvoicePayment_contractId_idx" ON "SupplyInvoicePayment"("contractId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_awardOnlineReturnId_idx" ON "DocumentAttachment"("awardOnlineReturnId");

-- AddForeignKey
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_submittedBySupplierAccountId_fkey" FOREIGN KEY ("submittedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_refusedByPersonId_fkey" FOREIGN KEY ("refusedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardQuery" ADD CONSTRAINT "AwardQuery_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardQuery" ADD CONSTRAINT "AwardQuery_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardQuery" ADD CONSTRAINT "AwardQuery_askedBySupplierAccountId_fkey" FOREIGN KEY ("askedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardQuery" ADD CONSTRAINT "AwardQuery_answeredByPersonId_fkey" FOREIGN KEY ("answeredByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentStorePolicy" ADD CONSTRAINT "DocumentStorePolicy_awardReturnClassId_fkey" FOREIGN KEY ("awardReturnClassId") REFERENCES "DocumentClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_awardOnlineReturnId_fkey" FOREIGN KEY ("awardOnlineReturnId") REFERENCES "AwardOnlineReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyInvoicePayment" ADD CONSTRAINT "SupplyInvoicePayment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyInvoicePayment" ADD CONSTRAINT "SupplyInvoicePayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyInvoicePayment" ADD CONSTRAINT "SupplyInvoicePayment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyInvoicePayment" ADD CONSTRAINT "SupplyInvoicePayment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyInvoicePayment" ADD CONSTRAINT "SupplyInvoicePayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- ------------------------------------------------------------------ CHECKs and partial indexes of the new tables

-- ADR 0045 D1: a work indent's acceptance page is lodged whole, every field typed and each attestation true, or not at all (a Letter of Acceptance).
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_page_whole" CHECK ((
  (length(btrim("signatoryName")) > 0 AND length(btrim("icNumber")) > 0 AND length(btrim("occupation")) > 0 AND length(btrim("address")) > 0
   AND length(btrim("capacity")) > 0 AND length(btrim("witnessName")) > 0
   AND "contractorSigned" IS TRUE AND "stampAffixed" IS TRUE AND "witnessSigned" IS TRUE)
  OR ("signatoryName" = '' AND "icNumber" = '' AND "occupation" = '' AND "address" = '' AND "capacity" = '' AND "witnessName" = ''
   AND "contractorSigned" IS NULL AND "stampAffixed" IS NULL AND "witnessSigned" IS NULL)) IS TRUE);
-- One decision: verified (who and when, together) or refused (who, when and a reason, together), never both.
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_verified_pair" CHECK ((("verifiedAt" IS NULL) = ("verifiedByPersonId" IS NULL)) IS TRUE);
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_refused_whole" CHECK (((("refusedAt" IS NULL) = ("refusedByPersonId" IS NULL))
  AND (CASE WHEN "refusedAt" IS NULL THEN "refusedReason" = '' ELSE length(btrim("refusedReason")) > 0 END)) IS TRUE);
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_one_decision" CHECK (("verifiedAt" IS NULL OR "refusedAt" IS NULL) IS TRUE);
-- At most one undecided return per award. It is also the open-work read of an award's waiting return.
CREATE UNIQUE INDEX "AwardOnlineReturn_one_waiting" ON "AwardOnlineReturn"("awardId") WHERE "verifiedAt" IS NULL AND "refusedAt" IS NULL;
-- The open-work query: the organisation's returns waiting for an officer, oldest first.
CREATE INDEX "AwardOnlineReturn_waiting_by_organisation" ON "AwardOnlineReturn"("organisationId", "submittedAt") WHERE "verifiedAt" IS NULL AND "refusedAt" IS NULL;

-- ADR 0045 D3: a question is 1 to 2000 characters. Its answer, who and when are set together, and an answer says something, in the same bound.
ALTER TABLE "AwardQuery" ADD CONSTRAINT "AwardQuery_body" CHECK ((length(btrim("body")) > 0 AND char_length("body") <= 2000) IS TRUE);
ALTER TABLE "AwardQuery" ADD CONSTRAINT "AwardQuery_answered_whole" CHECK (((("answeredAt" IS NULL) = ("answeredByPersonId" IS NULL))
  AND (CASE WHEN "answeredAt" IS NULL THEN "answer" = '' ELSE length(btrim("answer")) > 0 AND char_length("answer") <= 2000 END)) IS TRUE);
-- The open-work query: the organisation's questions waiting for an answer, oldest first.
CREATE INDEX "AwardQuery_unanswered_by_organisation" ON "AwardQuery"("organisationId", "askedAt") WHERE "answeredAt" IS NULL;

-- ADR 0045 D7 (WV-13): Finance's batch number is required, and the amount paid is more than nothing.
ALTER TABLE "SupplyInvoicePayment" ADD CONSTRAINT "SupplyInvoicePayment_batch_amount" CHECK ((length(btrim("batchNo")) > 0 AND "amount" > 0) IS TRUE);

-- ADR 0045 D6: the legacy submission's send path is closed, and it never takes the seventh kind.
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_not_supply_claim" CHECK (("kind" <> 'SUPPLY_CLAIM') IS TRUE);


-- ------------------------------------------------------------------ the attachment owner CHECKs, each replaced whole from its latest definition

-- ADR 0045 D1: a new owner. From 20261122000100, with awardOnlineReturnId added last.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId", "onlineBidFileId", "portalApplicationDocumentId", "portalApplicationCreditorId", "projectDocumentVersionId", "awardOnlineReturnId") = 1);

-- ADR 0045 D1, D6: two new arms, added last. From 20261122000100, every earlier arm word for word. The award's four return purposes are taken by the
-- online return too (its scans), and a project version takes the supply claim's two purposes beside its own.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" IN ('SIGNED_MINUTES', 'SITTING_MINUTES') AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET', 'PUBLISHED_SCHEDULE') AND "exerciseId" IS NOT NULL)
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
    OR ("purpose" = 'PORTAL_APPLICATION_DOCUMENT' AND "portalApplicationDocumentId" IS NOT NULL)
    OR ("purpose" = 'PORTAL_APPLICATION_BANK_STATEMENT' AND "portalApplicationCreditorId" IS NOT NULL)
    OR ("purpose" = 'PROJECT_DOCUMENT_FILE' AND "projectDocumentVersionId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
    OR ("purpose" IN ('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO') AND "contractId" IS NOT NULL)
    OR ("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL)
    OR ("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL)
    OR ("purpose" = 'DELAY_NOTICE' AND "delayNoticeId" IS NOT NULL)
    OR ("purpose" IN ('METEOROLOGICAL_RECORD', 'EOT_CALCULATION') AND "eotClaimId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardOnlineReturnId" IS NOT NULL)
    OR ("purpose" IN ('DELIVERY_ORDER', 'SUPPLY_INVOICE') AND "projectDocumentVersionId" IS NOT NULL)
  );


-- ------------------------------------------------------------------ the staff notice kinds, the CHECK replaced whole

-- ADR 0045 D4: two more kinds, a return lodged online and a question raised. From 20261122000100, with the two added last.
-- The kinds are in STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts) and a source test holds this, the latest definition, to that list.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM', 'INDENT_EXPIRED', 'COMMENCEMENT_LATE', 'PROJECT_DOCUMENT_TO_APPROVE', 'PROJECT_DOCUMENT_FROM_CONTRACTOR', 'PROJECT_DOCUMENT_REQUESTED', 'AWARD_RETURN_LODGED', 'AWARD_QUERY_RAISED')) IS TRUE);


-- ------------------------------------------------------------------ a project version's files, whatever their purpose (PW-33, PW-37 widened)

-- PW-37: a store version is the file of one project version only, ever. Keyed on the owner, not the purpose, so a supply claim's delivery order and
-- invoice are held as PROJECT_DOCUMENT_FILE is. Same name, so the workspace's refusal (PROJECT_FILE_ONE_PIN, src/lib/project-docs/store.ts) still
-- answers 409. Every existing row has the same predicate under both (only that purpose was on the owner), so the rebuild cannot fail on data.
DROP INDEX "DocumentAttachment_project_file_one_pin";
CREATE UNIQUE INDEX "DocumentAttachment_project_file_one_pin" ON "DocumentAttachment"("versionId") WHERE "projectDocumentVersionId" IS NOT NULL;

-- PA047, replaced whole from 20261124000000: a store version held by a live attachment on a project version is not withdrawn, whatever its purpose.
-- The trigger itself (ENABLE ALWAYS) is not recreated.
CREATE OR REPLACE FUNCTION public."document_version_project_file_kept"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."DocumentAttachment" a
              WHERE a."versionId" = NEW."id" AND a."projectDocumentVersionId" IS NOT NULL AND a."detachedAt" IS NULL) THEN
    RAISE EXCEPTION 'UPDATE on "DocumentVersion" is refused: this version is a project file, and a project file is kept'
      USING ERRCODE = 'PA047', HINT = 'ADR 0042 (PW-33). Send a new version of the project document instead.';
  END IF;
  RETURN NEW;
END
$$;


-- ------------------------------------------------------------------ triggers (each ENABLE ALWAYS, with its own SQLSTATE: PA048 to PA051)
-- The act's guarded write comes first. These are the backstop, for every database login. TRUNCATE skips row triggers, so each table also refuses
-- TRUNCATE with the trail's own function (PA001).

-- PA048: an online return is filed under its award's organisation, by a portal account of the award's awardee, undecided. It is never deleted. The one
-- change is its decision, once, from undecided: the verified pair or the refused triple, and nothing else in the same update (the CHECKs hold each whole).
CREATE FUNCTION public."award_online_return_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "Award" w JOIN "SupplierAccount" s ON s."id" = NEW."submittedBySupplierAccountId"
                    WHERE w."id" = NEW."awardId" AND w."organisationId" = NEW."organisationId" AND s."organisationId" = NEW."organisationId"
                      AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId") THEN
      RAISE EXCEPTION 'INSERT on "AwardOnlineReturn" is refused: a return is lodged in its award''s organisation, by an account of the award''s awardee'
        USING ERRCODE = 'PA048', HINT = 'ADR 0045 D1.';
    END IF;
    IF NEW."verifiedAt" IS NOT NULL OR NEW."refusedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT on "AwardOnlineReturn" is refused: a return is lodged undecided, and verified or refused later'
        USING ERRCODE = 'PA048', HINT = 'ADR 0045 D1.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."verifiedAt" IS NULL AND OLD."refusedAt" IS NULL AND (NEW."verifiedAt" IS NOT NULL OR NEW."refusedAt" IS NOT NULL)
     AND (to_jsonb(NEW) - 'verifiedByPersonId' - 'verifiedAt' - 'refusedByPersonId' - 'refusedAt' - 'refusedReason')
       = (to_jsonb(OLD) - 'verifiedByPersonId' - 'verifiedAt' - 'refusedByPersonId' - 'refusedAt' - 'refusedReason') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "AwardOnlineReturn" is refused: a lodged return is kept as sent, and decided once', TG_OP
    USING ERRCODE = 'PA048', HINT = 'ADR 0045 D1. After a refusal the contractor lodges a new return.';
END
$$;

CREATE TRIGGER "AwardOnlineReturn_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AwardOnlineReturn" FOR EACH ROW EXECUTE FUNCTION public."award_online_return_guard"();
CREATE TRIGGER "AwardOnlineReturn_no_truncate" BEFORE TRUNCATE ON "AwardOnlineReturn" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "AwardOnlineReturn" ENABLE ALWAYS TRIGGER "AwardOnlineReturn_guard";
ALTER TABLE "AwardOnlineReturn" ENABLE ALWAYS TRIGGER "AwardOnlineReturn_no_truncate";

-- PA049: a question is filed under its award's organisation, asked by a portal account of the award's awardee, unanswered. It is never deleted. The one
-- change is its answer, once, from unanswered: the answer, who and when, and nothing else in the same update (the CHECK holds them whole).
CREATE FUNCTION public."award_query_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "Award" w JOIN "SupplierAccount" s ON s."id" = NEW."askedBySupplierAccountId"
                    WHERE w."id" = NEW."awardId" AND w."organisationId" = NEW."organisationId" AND s."organisationId" = NEW."organisationId"
                      AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId") THEN
      RAISE EXCEPTION 'INSERT on "AwardQuery" is refused: a question is asked in its award''s organisation, by an account of the award''s awardee'
        USING ERRCODE = 'PA049', HINT = 'ADR 0045 D3.';
    END IF;
    IF NEW."answeredAt" IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT on "AwardQuery" is refused: a question is asked unanswered, and answered later'
        USING ERRCODE = 'PA049', HINT = 'ADR 0045 D3.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."answeredAt" IS NULL AND NEW."answeredAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'answer' - 'answeredByPersonId' - 'answeredAt') = (to_jsonb(OLD) - 'answer' - 'answeredByPersonId' - 'answeredAt') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "AwardQuery" is refused: a question is kept as asked, and answered once', TG_OP
    USING ERRCODE = 'PA049', HINT = 'ADR 0045 D3.';
END
$$;

CREATE TRIGGER "AwardQuery_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AwardQuery" FOR EACH ROW EXECUTE FUNCTION public."award_query_guard"();
CREATE TRIGGER "AwardQuery_no_truncate" BEFORE TRUNCATE ON "AwardQuery" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "AwardQuery" ENABLE ALWAYS TRIGGER "AwardQuery_guard";
ALTER TABLE "AwardQuery" ENABLE ALWAYS TRIGGER "AwardQuery_no_truncate";

-- PA050: a supply payment is filed under its contract's organisation, against a supply claim of that contract, and names a version of that claim that
-- was verified (marked TAKEN_UP). Write-once: a plain change or removal is refused by the trail's own function (PA001).
CREATE FUNCTION public."supply_invoice_payment_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Contract" c JOIN "ProjectDocument" d ON d."contractId" = c."id"
                  WHERE c."id" = NEW."contractId" AND c."organisationId" = NEW."organisationId"
                    AND d."id" = NEW."documentId" AND d."organisationId" = NEW."organisationId" AND d."kind" = 'SUPPLY_CLAIM') THEN
    RAISE EXCEPTION 'INSERT on "SupplyInvoicePayment" is refused: a payment is recorded against a supply claim of its own contract, in its organisation'
      USING ERRCODE = 'PA050', HINT = 'ADR 0045 D7.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ProjectDocumentVersion" v JOIN "ProjectDocumentDecision" x ON x."versionId" = v."id"
                  WHERE v."id" = NEW."versionId" AND v."documentId" = NEW."documentId" AND x."outcome" = 'TAKEN_UP') THEN
    RAISE EXCEPTION 'INSERT on "SupplyInvoicePayment" is refused: a payment names a verified version of its claim'
      USING ERRCODE = 'PA050', HINT = 'ADR 0045 D7. A claim is paid only once it is verified.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "SupplyInvoicePayment_insert" BEFORE INSERT ON "SupplyInvoicePayment" FOR EACH ROW EXECUTE FUNCTION public."supply_invoice_payment_insert"();
CREATE TRIGGER "SupplyInvoicePayment_append_only" BEFORE UPDATE OR DELETE ON "SupplyInvoicePayment" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "SupplyInvoicePayment_no_truncate" BEFORE TRUNCATE ON "SupplyInvoicePayment" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "SupplyInvoicePayment" ENABLE ALWAYS TRIGGER "SupplyInvoicePayment_insert";
ALTER TABLE "SupplyInvoicePayment" ENABLE ALWAYS TRIGGER "SupplyInvoicePayment_append_only";
ALTER TABLE "SupplyInvoicePayment" ENABLE ALWAYS TRIGGER "SupplyInvoicePayment_no_truncate";

-- PA051: an online return's scans are pinned while it waits, and frozen once it is decided: no attachment is added to, moved onto, changed or detached
-- from a decided return (ADR 0045 D1). Rows of every other owner pass untouched. DELETE is not judged here.
CREATE FUNCTION public."award_online_return_files_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW."awardOnlineReturnId" IS NOT NULL AND EXISTS (SELECT 1 FROM "AwardOnlineReturn" r WHERE r."id" = NEW."awardOnlineReturnId" AND (r."verifiedAt" IS NOT NULL OR r."refusedAt" IS NOT NULL)))
     OR (TG_OP = 'UPDATE' AND OLD."awardOnlineReturnId" IS NOT NULL AND EXISTS (SELECT 1 FROM "AwardOnlineReturn" r WHERE r."id" = OLD."awardOnlineReturnId" AND (r."verifiedAt" IS NOT NULL OR r."refusedAt" IS NOT NULL))) THEN
    RAISE EXCEPTION '% on "DocumentAttachment" is refused: the files of a decided online return are kept as they were', TG_OP
      USING ERRCODE = 'PA051', HINT = 'ADR 0045 D1. A refused return is lodged again, with new files.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "DocumentAttachment_online_return_frozen" BEFORE INSERT OR UPDATE ON "DocumentAttachment" FOR EACH ROW EXECUTE FUNCTION public."award_online_return_files_frozen"();
ALTER TABLE "DocumentAttachment" ENABLE ALWAYS TRIGGER "DocumentAttachment_online_return_frozen";
