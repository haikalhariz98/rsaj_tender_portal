-- ADR 0042 (plan project-workspace-simple-plan.md step 1, PW-1 to PW-32): the simple Project workspace. Additive only: five new tables, two new enums,
-- two new nullable columns, the attachment owner CHECKs and the staff notice CHECK replaced whole so that more is allowed (every existing row already
-- satisfies each), and the triggers that keep the new rows. No existing row is written, changed or deleted. The new attachment purpose is in its own
-- earlier migration (20261122000000, BD-613-112, PW-31), so it can be named here.

-- CreateEnum
CREATE TYPE "ProjectSide" AS ENUM ('CONTRACTOR', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "ProjectDocumentOutcome" AS ENUM ('APPROVED', 'REJECTED', 'TAKEN_UP', 'RETURNED');

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "projectDocumentVersionId" TEXT;

-- AlterTable
ALTER TABLE "DocumentStorePolicy" ADD COLUMN     "projectDocumentClassId" TEXT;

-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "side" "ProjectSide" NOT NULL,
    "kind" "ContractorSubmissionKind",
    "createdByPersonId" TEXT,
    "createdBySupplierAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "uploadedByPersonId" TEXT,
    "uploadedBySupplierAccountId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "uploadedOn" TIMESTAMP(3) NOT NULL,
    "noApproversAtUpload" BOOLEAN NOT NULL,
    "requestId" TEXT,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "toSide" "ProjectSide" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "requestedByPersonId" TEXT,
    "requestedBySupplierAccountId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentApprover" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "addedByPersonId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedByPersonId" TEXT,
    "removeReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProjectDocumentApprover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocumentDecision" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "approverId" TEXT,
    "outcome" "ProjectDocumentOutcome" NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "decidedByPersonId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "decidedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocumentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDocument_contractId_createdAt_idx" ON "ProjectDocument"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectDocument_organisationId_idx" ON "ProjectDocument"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDocumentVersion_requestId_key" ON "ProjectDocumentVersion"("requestId");

-- CreateIndex
CREATE INDEX "ProjectDocumentVersion_organisationId_uploadedAt_idx" ON "ProjectDocumentVersion"("organisationId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDocumentVersion_documentId_number_key" ON "ProjectDocumentVersion"("documentId", "number");

-- CreateIndex
CREATE INDEX "ProjectDocumentRequest_documentId_idx" ON "ProjectDocumentRequest"("documentId");

-- CreateIndex
CREATE INDEX "ProjectDocumentApprover_documentId_idx" ON "ProjectDocumentApprover"("documentId");

-- CreateIndex
CREATE INDEX "ProjectDocumentDecision_versionId_idx" ON "ProjectDocumentDecision"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDocumentDecision_versionId_approverId_key" ON "ProjectDocumentDecision"("versionId", "approverId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_projectDocumentVersionId_idx" ON "DocumentAttachment"("projectDocumentVersionId");

-- AddForeignKey
ALTER TABLE "DocumentStorePolicy" ADD CONSTRAINT "DocumentStorePolicy_projectDocumentClassId_fkey" FOREIGN KEY ("projectDocumentClassId") REFERENCES "DocumentClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_projectDocumentVersionId_fkey" FOREIGN KEY ("projectDocumentVersionId") REFERENCES "ProjectDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_createdByPersonId_fkey" FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_createdBySupplierAccountId_fkey" FOREIGN KEY ("createdBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_uploadedByPersonId_fkey" FOREIGN KEY ("uploadedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_uploadedBySupplierAccountId_fkey" FOREIGN KEY ("uploadedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProjectDocumentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentRequest" ADD CONSTRAINT "ProjectDocumentRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentRequest" ADD CONSTRAINT "ProjectDocumentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentRequest" ADD CONSTRAINT "ProjectDocumentRequest_requestedByPersonId_fkey" FOREIGN KEY ("requestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentRequest" ADD CONSTRAINT "ProjectDocumentRequest_requestedBySupplierAccountId_fkey" FOREIGN KEY ("requestedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_addedByPersonId_fkey" FOREIGN KEY ("addedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_removedByPersonId_fkey" FOREIGN KEY ("removedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentDecision" ADD CONSTRAINT "ProjectDocumentDecision_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentDecision" ADD CONSTRAINT "ProjectDocumentDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentDecision" ADD CONSTRAINT "ProjectDocumentDecision_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "ProjectDocumentApprover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocumentDecision" ADD CONSTRAINT "ProjectDocumentDecision_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ------------------------------------------------------------------ CHECKs and partial indexes of the new tables

-- Who created a document, made a version or asked for one: a staff person or a supplier's portal account, exactly one.
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_one_creator" CHECK ((num_nonnulls("createdByPersonId", "createdBySupplierAccountId") = 1) IS TRUE);
-- PW-9: one of the six kinds is on a CONTRACTOR document only.
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_kind_contractor" CHECK (("kind" IS NULL OR "side" = 'CONTRACTOR') IS TRUE);
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_title" CHECK ((length(btrim("title")) > 0) IS TRUE);

ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_one_uploader" CHECK ((num_nonnulls("uploadedByPersonId", "uploadedBySupplierAccountId") = 1) IS TRUE);
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_number" CHECK (("number" >= 1) IS TRUE);

ALTER TABLE "ProjectDocumentRequest" ADD CONSTRAINT "ProjectDocumentRequest_one_requester" CHECK ((num_nonnulls("requestedByPersonId", "requestedBySupplierAccountId") = 1) IS TRUE);

-- PW-6, PW-25: a removal names its day and who removed, together, and always a reason.
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_removed_pair" CHECK ((("removedAt" IS NULL) = ("removedByPersonId" IS NULL)) IS TRUE);
ALTER TABLE "ProjectDocumentApprover" ADD CONSTRAINT "ProjectDocumentApprover_removed_reason" CHECK (("removedAt" IS NULL OR length(btrim("removeReason")) > 0) IS TRUE);
-- A person is a live approver of a document once at most. Removed, they may be named again (a new row).
CREATE UNIQUE INDEX "ProjectDocumentApprover_one_live_per_person" ON "ProjectDocumentApprover"("documentId", "personId") WHERE "removedAt" IS NULL;
-- The open-work query: the documents a person is a live approver of ("Waiting for me", the approver's notice).
CREATE INDEX "ProjectDocumentApprover_live_by_person" ON "ProjectDocumentApprover"("personId") WHERE "removedAt" IS NULL;

-- PW-7, PW-9: an approver's decision is APPROVED or REJECTED and names the approver, a mark on a kind is TAKEN_UP or RETURNED and names none.
ALTER TABLE "ProjectDocumentDecision" ADD CONSTRAINT "ProjectDocumentDecision_approver_outcome" CHECK ((("outcome" IN ('APPROVED', 'REJECTED')) = ("approverId" IS NOT NULL)) IS TRUE);
-- A rejection and a return say why, in the decider's own words.
ALTER TABLE "ProjectDocumentDecision" ADD CONSTRAINT "ProjectDocumentDecision_remarks" CHECK (("outcome" NOT IN ('REJECTED', 'RETURNED') OR length(btrim("remarks")) > 0) IS TRUE);
-- One mark per version of a kind (an approver's decision is one per approver per version, by the Prisma unique key).
CREATE UNIQUE INDEX "ProjectDocumentDecision_one_mark_per_version" ON "ProjectDocumentDecision"("versionId") WHERE "approverId" IS NULL;


-- ------------------------------------------------------------------ the attachment owner CHECKs, each replaced whole from its latest definition

-- ADR 0042 D1: a new owner. From 20261117001000, with projectDocumentVersionId added last.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId", "onlineBidFileId", "portalApplicationDocumentId", "portalApplicationCreditorId", "projectDocumentVersionId") = 1);

-- ADR 0042 D1: a new purpose, on its own owner. From 20261117001000, with the one line added after the online application's.
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
  );


-- ------------------------------------------------------------------ the staff notice kinds, the CHECK replaced whole

-- ADR 0042 D6 (PW-13): three more kinds, a version to approve and what the contractor sent or asked for. From 20261110000000, with the three added last.
-- The kinds are in STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts) and a source test holds this, the latest definition, to that list.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM', 'INDENT_EXPIRED', 'COMMENCEMENT_LATE', 'PROJECT_DOCUMENT_TO_APPROVE', 'PROJECT_DOCUMENT_FROM_CONTRACTOR', 'PROJECT_DOCUMENT_REQUESTED')) IS TRUE);


-- ------------------------------------------------------------------ triggers (each ENABLE ALWAYS, with its own SQLSTATE: PA040 to PA044)
-- The act's guarded write comes first. These are the backstop, for every database login. A plain change or removal of an append-only row is refused
-- by the trail's own function (PA001). TRUNCATE skips row triggers, so each table also refuses TRUNCATE.

-- PA040: a document is never deleted. It is filed under its contract's organisation, and the one change made to it is its kind, set once from null
-- by the contractor's first version, while no approver is live on it (a document with a kind takes no approvers, PW-9).
CREATE FUNCTION public."project_document_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "Contract" c WHERE c."id" = NEW."contractId" AND c."organisationId" = NEW."organisationId") THEN
      RAISE EXCEPTION 'INSERT on "ProjectDocument" is refused: a document is filed under its contract''s own organisation'
        USING ERRCODE = 'PA040', HINT = 'ADR 0042 D1.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."kind" IS NULL AND NEW."kind" IS NOT NULL
     AND (to_jsonb(NEW) - 'kind') = (to_jsonb(OLD) - 'kind') THEN
    IF EXISTS (SELECT 1 FROM "ProjectDocumentApprover" a WHERE a."documentId" = NEW."id" AND a."removedAt" IS NULL) THEN
      RAISE EXCEPTION 'UPDATE on "ProjectDocument" is refused: a document with a kind takes no approvers, and this one has a live approver'
        USING ERRCODE = 'PA040', HINT = 'ADR 0042 D4 (PW-9).';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "ProjectDocument" is refused: a project document is kept, and only its kind is set, once', TG_OP
    USING ERRCODE = 'PA040', HINT = 'ADR 0042 D1. A later change is a new document.';
END
$$;

CREATE TRIGGER "ProjectDocument_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectDocument" FOR EACH ROW EXECUTE FUNCTION public."project_document_guard"();
CREATE TRIGGER "ProjectDocument_no_truncate" BEFORE TRUNCATE ON "ProjectDocument" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "ProjectDocument" ENABLE ALWAYS TRIGGER "ProjectDocument_guard";
ALTER TABLE "ProjectDocument" ENABLE ALWAYS TRIGGER "ProjectDocument_no_truncate";

-- PA041: a version comes from its document's side (PW-8): a portal account on a CONTRACTOR document, a staff person on an ORGANISATION one. It is the
-- next number, in its document's organisation, and the request it answers is its own document's, still open.
CREATE FUNCTION public."project_document_version_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doc_side "ProjectSide";
  doc_org text;
  next_number integer;
BEGIN
  SELECT d."side", d."organisationId" INTO doc_side, doc_org FROM "ProjectDocument" d WHERE d."id" = NEW."documentId";
  IF doc_org IS DISTINCT FROM NEW."organisationId" THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: a version is filed under its document''s organisation'
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1.';
  END IF;
  IF (doc_side = 'CONTRACTOR' AND NEW."uploadedBySupplierAccountId" IS NULL) OR (doc_side = 'ORGANISATION' AND NEW."uploadedByPersonId" IS NULL) THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: a version comes from its document''s side'
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1 (PW-8). The contractor uploads to a contractor document, the organisation to its own.';
  END IF;
  SELECT COALESCE(max(v."number"), 0) + 1 INTO next_number FROM "ProjectDocumentVersion" v WHERE v."documentId" = NEW."documentId";
  IF NEW."number" <> next_number THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: the next version of this document is version %', next_number
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1. Versions are numbered 1, 2, 3 with no gap.';
  END IF;
  IF NEW."requestId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProjectDocumentRequest" r WHERE r."id" = NEW."requestId" AND r."documentId" = NEW."documentId") THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: a version answers a request for its own document'
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ProjectDocumentVersion_insert" BEFORE INSERT ON "ProjectDocumentVersion" FOR EACH ROW EXECUTE FUNCTION public."project_document_version_insert"();
CREATE TRIGGER "ProjectDocumentVersion_append_only" BEFORE UPDATE OR DELETE ON "ProjectDocumentVersion" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "ProjectDocumentVersion_no_truncate" BEFORE TRUNCATE ON "ProjectDocumentVersion" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "ProjectDocumentVersion" ENABLE ALWAYS TRIGGER "ProjectDocumentVersion_insert";
ALTER TABLE "ProjectDocumentVersion" ENABLE ALWAYS TRIGGER "ProjectDocumentVersion_append_only";
ALTER TABLE "ProjectDocumentVersion" ENABLE ALWAYS TRIGGER "ProjectDocumentVersion_no_truncate";

-- PA042: a request goes to its document's side, from the other side (PW-5, PW-30), in its document's organisation, and only while no other request
-- on the document is open (one that no version names).
CREATE FUNCTION public."project_document_request_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doc_side "ProjectSide";
  doc_org text;
BEGIN
  SELECT d."side", d."organisationId" INTO doc_side, doc_org FROM "ProjectDocument" d WHERE d."id" = NEW."documentId";
  IF doc_org IS DISTINCT FROM NEW."organisationId" THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentRequest" is refused: a request is filed under its document''s organisation'
      USING ERRCODE = 'PA042', HINT = 'ADR 0042 D1.';
  END IF;
  IF NEW."toSide" IS DISTINCT FROM doc_side
     OR (NEW."toSide" = 'CONTRACTOR' AND NEW."requestedByPersonId" IS NULL)
     OR (NEW."toSide" = 'ORGANISATION' AND NEW."requestedBySupplierAccountId" IS NULL) THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentRequest" is refused: a request goes to the document''s side, from the other side'
      USING ERRCODE = 'PA042', HINT = 'ADR 0042 D1 (PW-5, PW-30).';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProjectDocumentRequest" r WHERE r."documentId" = NEW."documentId"
             AND NOT EXISTS (SELECT 1 FROM "ProjectDocumentVersion" v WHERE v."requestId" = r."id")) THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentRequest" is refused: the document already has an open request'
      USING ERRCODE = 'PA042', HINT = 'ADR 0042 D1. A request is open until a version answers it.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ProjectDocumentRequest_insert" BEFORE INSERT ON "ProjectDocumentRequest" FOR EACH ROW EXECUTE FUNCTION public."project_document_request_insert"();
CREATE TRIGGER "ProjectDocumentRequest_append_only" BEFORE UPDATE OR DELETE ON "ProjectDocumentRequest" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "ProjectDocumentRequest_no_truncate" BEFORE TRUNCATE ON "ProjectDocumentRequest" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "ProjectDocumentRequest" ENABLE ALWAYS TRIGGER "ProjectDocumentRequest_insert";
ALTER TABLE "ProjectDocumentRequest" ENABLE ALWAYS TRIGGER "ProjectDocumentRequest_append_only";
ALTER TABLE "ProjectDocumentRequest" ENABLE ALWAYS TRIGGER "ProjectDocumentRequest_no_truncate";

-- PA043: an approver is named on a document with no kind (PW-9), live, in the document's organisation. Never deleted. The one change is the removal,
-- once, from live: removedAt, removedByPersonId and removeReason together (the CHECKs hold the pair and the reason), nothing else in the same update.
CREATE FUNCTION public."project_document_approver_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doc_kind "ContractorSubmissionKind";
  doc_org text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT d."kind", d."organisationId" INTO doc_kind, doc_org FROM "ProjectDocument" d WHERE d."id" = NEW."documentId";
    IF doc_org IS DISTINCT FROM NEW."organisationId" THEN
      RAISE EXCEPTION 'INSERT on "ProjectDocumentApprover" is refused: an approver is named under the document''s organisation'
        USING ERRCODE = 'PA043', HINT = 'ADR 0042 D1.';
    END IF;
    IF doc_kind IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT on "ProjectDocumentApprover" is refused: a document with a kind takes no approvers'
        USING ERRCODE = 'PA043', HINT = 'ADR 0042 D4 (PW-9). Its version is taken up or returned instead.';
    END IF;
    IF NEW."removedAt" IS NOT NULL OR NEW."removeReason" <> '' THEN
      RAISE EXCEPTION 'INSERT on "ProjectDocumentApprover" is refused: an approver is named live, and removed later'
        USING ERRCODE = 'PA043', HINT = 'ADR 0042 D2.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."removedAt" IS NULL AND NEW."removedAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'removedAt' - 'removedByPersonId' - 'removeReason') = (to_jsonb(OLD) - 'removedAt' - 'removedByPersonId' - 'removeReason') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "ProjectDocumentApprover" is refused: an approver is kept, and removed once, with a reason', TG_OP
    USING ERRCODE = 'PA043', HINT = 'ADR 0042 D2 (PW-25). To replace an approver, add the new one first, then remove.';
END
$$;

CREATE TRIGGER "ProjectDocumentApprover_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectDocumentApprover" FOR EACH ROW EXECUTE FUNCTION public."project_document_approver_guard"();
CREATE TRIGGER "ProjectDocumentApprover_no_truncate" BEFORE TRUNCATE ON "ProjectDocumentApprover" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "ProjectDocumentApprover" ENABLE ALWAYS TRIGGER "ProjectDocumentApprover_guard";
ALTER TABLE "ProjectDocumentApprover" ENABLE ALWAYS TRIGGER "ProjectDocumentApprover_no_truncate";

-- PA044: a decision is on the document's latest version, in its organisation. APPROVED and REJECTED are an approver's, on a document with no kind:
-- the approver is live, on the same document, and is the person deciding. TAKEN_UP and RETURNED are the mark on a kind. Nobody decides a version
-- they uploaded (PW-6).
CREATE FUNCTION public."project_document_decision_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_document text;
  v_number integer;
  v_org text;
  v_uploader text;
  doc_kind "ContractorSubmissionKind";
  latest integer;
BEGIN
  SELECT v."documentId", v."number", v."organisationId", v."uploadedByPersonId" INTO v_document, v_number, v_org, v_uploader
    FROM "ProjectDocumentVersion" v WHERE v."id" = NEW."versionId";
  IF v_org IS DISTINCT FROM NEW."organisationId" THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentDecision" is refused: a decision is filed under its version''s organisation'
      USING ERRCODE = 'PA044', HINT = 'ADR 0042 D1.';
  END IF;
  SELECT d."kind" INTO doc_kind FROM "ProjectDocument" d WHERE d."id" = v_document;
  IF doc_kind IS NOT NULL AND NEW."outcome" IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentDecision" is refused: a document with a kind is never approved or rejected, only taken up or returned'
      USING ERRCODE = 'PA044', HINT = 'ADR 0042 D4 (PW-9).';
  END IF;
  IF doc_kind IS NULL AND NEW."outcome" IN ('TAKEN_UP', 'RETURNED') THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentDecision" is refused: only a document with a kind is taken up or returned'
      USING ERRCODE = 'PA044', HINT = 'ADR 0042 D4 (PW-9).';
  END IF;
  IF NEW."approverId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "ProjectDocumentApprover" a
        WHERE a."id" = NEW."approverId" AND a."documentId" = v_document AND a."removedAt" IS NULL AND a."personId" = NEW."decidedByPersonId") THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentDecision" is refused: only a live approver of this document decides, as themselves'
      USING ERRCODE = 'PA044', HINT = 'ADR 0042 D2 (PW-6).';
  END IF;
  SELECT max(v."number") INTO latest FROM "ProjectDocumentVersion" v WHERE v."documentId" = v_document;
  IF v_number IS DISTINCT FROM latest THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentDecision" is refused: only the latest version is decided'
      USING ERRCODE = 'PA044', HINT = 'ADR 0042 D2 (PW-6). Decisions never carry over to a new version.';
  END IF;
  IF v_uploader IS NOT NULL AND v_uploader = NEW."decidedByPersonId" THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentDecision" is refused: nobody decides a version they uploaded'
      USING ERRCODE = 'PA044', HINT = 'ADR 0042 D2 (PW-6).';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ProjectDocumentDecision_insert" BEFORE INSERT ON "ProjectDocumentDecision" FOR EACH ROW EXECUTE FUNCTION public."project_document_decision_insert"();
CREATE TRIGGER "ProjectDocumentDecision_append_only" BEFORE UPDATE OR DELETE ON "ProjectDocumentDecision" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "ProjectDocumentDecision_no_truncate" BEFORE TRUNCATE ON "ProjectDocumentDecision" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "ProjectDocumentDecision" ENABLE ALWAYS TRIGGER "ProjectDocumentDecision_insert";
ALTER TABLE "ProjectDocumentDecision" ENABLE ALWAYS TRIGGER "ProjectDocumentDecision_append_only";
ALTER TABLE "ProjectDocumentDecision" ENABLE ALWAYS TRIGGER "ProjectDocumentDecision_no_truncate";
