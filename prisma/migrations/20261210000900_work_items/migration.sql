-- Workspace 3a (plan workspace-3a-build-plan.md section 3.1): work items, their comments and links, a work item as an attachment owner, and four staff
-- notice kinds. CHECKs and the comment's append-only triggers by hand at the end. WORK_ITEM_FILE arrived alone in 20261210000800.
-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('RFI', 'SITE_INSTRUCTION', 'INSPECTION', 'SAFETY_INCIDENT', 'ACTION', 'DEFECT', 'TASK');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkItemPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WorkItemImpact" AS ENUM ('NONE', 'COST', 'TIME', 'COST_AND_TIME');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('NOT_YET', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'DANGEROUS_OCCURRENCE');

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "workItemId" TEXT;

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "WorkItemType" NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "WorkItemStatus" NOT NULL DEFAULT 'TO_DO',
    "priority" "WorkItemPriority" NOT NULL DEFAULT 'NORMAL',
    "dueOn" DATE,
    "location" TEXT NOT NULL DEFAULT '',
    "raisedByPersonId" TEXT,
    "assigneePersonId" TEXT,
    "assigneeSupplierAccountId" TEXT,
    "answer" TEXT NOT NULL DEFAULT '',
    "impact" "WorkItemImpact",
    "inspectionResult" "InspectionResult",
    "severity" "IncidentSeverity",
    "happenedAt" TIMESTAMP(3),
    "fromDocumentId" TEXT,
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemComment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "personId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemLink" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "toWorkItemId" TEXT,
    "projectDocumentId" TEXT,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkItem_contractId_status_idx" ON "WorkItem"("contractId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_assigneePersonId_status_idx" ON "WorkItem"("assigneePersonId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_organisationId_idx" ON "WorkItem"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_contractId_type_number_key" ON "WorkItem"("contractId", "type", "number");

-- CreateIndex
CREATE INDEX "WorkItemComment_workItemId_recordedAt_idx" ON "WorkItemComment"("workItemId", "recordedAt");

-- CreateIndex
CREATE INDEX "WorkItemLink_toWorkItemId_idx" ON "WorkItemLink"("toWorkItemId");

-- CreateIndex
CREATE INDEX "WorkItemLink_projectDocumentId_idx" ON "WorkItemLink"("projectDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemLink_workItemId_toWorkItemId_key" ON "WorkItemLink"("workItemId", "toWorkItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemLink_workItemId_projectDocumentId_key" ON "WorkItemLink"("workItemId", "projectDocumentId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_workItemId_idx" ON "DocumentAttachment"("workItemId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_raisedByPersonId_fkey" FOREIGN KEY ("raisedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_assigneePersonId_fkey" FOREIGN KEY ("assigneePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_assigneeSupplierAccountId_fkey" FOREIGN KEY ("assigneeSupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_fromDocumentId_fkey" FOREIGN KEY ("fromDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_toWorkItemId_fkey" FOREIGN KEY ("toWorkItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_projectDocumentId_fkey" FOREIGN KEY ("projectDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------------ the work item's CHECKs (the act judges first, these are the backstops)

ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_number_positive" CHECK ("number" > 0);
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_title_present" CHECK (btrim("title") <> '');
-- The bounds of src/lib/work/bounds.ts, counted in code points as textLength counts them.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_lengths" CHECK (
  char_length("title") <= 200 AND char_length("location") <= 120
  AND char_length("description") <= 10000 AND char_length("answer") <= 10000 AND char_length("cancelReason") <= 10000
);
-- 3b replaces this with exactly one raiser, a person or a supplier account.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_raised_by_person" CHECK ("raisedByPersonId" IS NOT NULL);
-- WS-9: on a person or on the contractor's account, never both.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_one_assignee" CHECK (num_nonnulls("assigneePersonId", "assigneeSupplierAccountId") <= 1);
-- Each type's own columns, on that type only.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_impact_of_type" CHECK ("impact" IS NULL OR "type" IN ('RFI', 'SITE_INSTRUCTION'));
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_answer_of_type" CHECK ("answer" = '' OR "type" = 'RFI');
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_result_of_type" CHECK (("inspectionResult" IS NOT NULL) = ("type" = 'INSPECTION'));
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_incident_of_type" CHECK (
  ("severity" IS NOT NULL) = ("type" = 'SAFETY_INCIDENT') AND ("happenedAt" IS NOT NULL) = ("type" = 'SAFETY_INCIDENT')
);
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_from_document_of_type" CHECK ("fromDocumentId" IS NULL OR "type" = 'ACTION');
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_due_of_type" CHECK ("dueOn" IS NOT NULL OR "type" NOT IN ('RFI', 'SITE_INSTRUCTION'));
-- A cancelled item says why.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_cancel_reason" CHECK ("status" <> 'CANCELLED' OR btrim("cancelReason") <> '');
-- Set on Done and Cancelled, cleared on reopen: the Board's Done window reads it, never updatedAt.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_closed_at" CHECK (("closedAt" IS NOT NULL) = ("status" IN ('DONE', 'CANCELLED')));

-- ------------------------------------------------------------------ the comment's CHECKs, and it is append-only

ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_body" CHECK (btrim("body") <> '' AND char_length("body") <= 10000);
-- 3b replaces this with exactly one of a person or a supplier account.
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_by_person" CHECK ("personId" IS NOT NULL);

-- PA001, as ProjectDocumentDecision: no login changes or removes a comment. TRUNCATE skips row triggers, so it is refused too.
CREATE TRIGGER "WorkItemComment_append_only" BEFORE UPDATE OR DELETE ON "WorkItemComment" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "WorkItemComment_no_truncate" BEFORE TRUNCATE ON "WorkItemComment" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "WorkItemComment" ENABLE ALWAYS TRIGGER "WorkItemComment_append_only";
ALTER TABLE "WorkItemComment" ENABLE ALWAYS TRIGGER "WorkItemComment_no_truncate";

-- ------------------------------------------------------------------ the link's CHECKs

ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_one_target" CHECK (num_nonnulls("toWorkItemId", "projectDocumentId") = 1);
ALTER TABLE "WorkItemLink" ADD CONSTRAINT "WorkItemLink_not_itself" CHECK ("toWorkItemId" IS NULL OR "toWorkItemId" <> "workItemId");


-- ------------------------------------------------------------------ the attachment owner CHECKs, each replaced whole from its latest definition

-- Workspace 3a: a new owner. From 20261201000100, with workItemId added last.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId", "onlineBidFileId", "portalApplicationDocumentId", "portalApplicationCreditorId", "projectDocumentVersionId", "awardOnlineReturnId", "workItemId") = 1);

-- Workspace 3a: one new arm, added last (WORK_ITEM_FILE on the work item, and the work item takes no other purpose). From 20261201000100, every earlier arm
-- word for word.
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
    OR ("purpose" = 'WORK_ITEM_FILE' AND "workItemId" IS NOT NULL)
  );


-- ------------------------------------------------------------------ the staff notice kinds, the CHECK replaced whole

-- Workspace 3a (W-10): four work item kinds. From 20261210000100, with the four added last.
-- The kinds are in STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts) and a source test holds this, the latest definition, to that list.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM', 'INDENT_EXPIRED', 'COMMENCEMENT_LATE', 'PROJECT_DOCUMENT_TO_APPROVE', 'PROJECT_DOCUMENT_FROM_CONTRACTOR', 'PROJECT_DOCUMENT_REQUESTED', 'AWARD_RETURN_LODGED', 'AWARD_QUERY_RAISED', 'DLP_ENDING', 'DEFECT_RECTIFIED', 'WORK_ITEM_ASSIGNED', 'WORK_ITEM_TO_CHECK', 'WORK_ITEM_RETURNED', 'WORK_ITEM_COMMENT')) IS TRUE);
