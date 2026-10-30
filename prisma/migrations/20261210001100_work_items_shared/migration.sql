-- Workspace 3b (plan workspace-3b-build-plan.md section 3.1, migration 1, ADR 0049): sharing a work item with the contractor, the contractor as raiser,
-- assignee and writer, the defect line a Defect item stands for (written in 3b-ii), a work item's file kept from withdrawal (PA047, WB-4), and the one
-- new staff notice kind. Additive: new nullable columns and one with a default, and three 3a CHECKs replaced by wider ones that every 3a row already meets.
-- NO BACKFILL (ADR 0049 D1, WS-14): "sharedAt" is added null on every existing item, so every 3a item stays unshared.

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "assignedToContractor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defectItemId" TEXT,
ADD COLUMN     "raisedBySupplierAccountId" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkItemComment" ADD COLUMN     "supplierAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_defectItemId_key" ON "WorkItem"("defectItemId");

-- CreateIndex
CREATE INDEX "WorkItem_contractId_sharedAt_idx" ON "WorkItem"("contractId", "sharedAt");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_raisedBySupplierAccountId_fkey" FOREIGN KEY ("raisedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_defectItemId_fkey" FOREIGN KEY ("defectItemId") REFERENCES "DefectItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------------ the work item's CHECKs (B-1, B-7, B-8, B-18)

-- Replaces 3a's "WorkItem_raised_by_person": exactly one raiser, a person or a contractor's account.
ALTER TABLE "WorkItem" DROP CONSTRAINT "WorkItem_raised_by_person";
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_one_raiser" CHECK (num_nonnulls("raisedByPersonId", "raisedBySupplierAccountId") = 1);
-- Replaced under its own name: at most one of a person, the contractor (the company), and the per-account column WS-9 leaves unwritten.
ALTER TABLE "WorkItem" DROP CONSTRAINT "WorkItem_one_assignee";
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_one_assignee" CHECK (num_nonnulls("assigneePersonId", "assigneeSupplierAccountId") + "assignedToContractor"::int <= 1);
-- An item the contractor holds or raised is shared (ADR 0049 D1): assigning to the contractor shares in the same act.
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_contractor_party_shared" CHECK (
  "sharedAt" IS NOT NULL OR NOT ("assignedToContractor" OR "assigneeSupplierAccountId" IS NOT NULL OR "raisedBySupplierAccountId" IS NOT NULL)
);
-- The contractor raises only an RFI or a safety incident (0008 section 4.1).
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_contractor_raises_type" CHECK ("raisedBySupplierAccountId" IS NULL OR "type" IN ('RFI', 'SAFETY_INCIDENT'));
-- A defect line is linked to a Defect item only (B-18, written in 3b-ii).
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_defect_of_type" CHECK ("defectItemId" IS NULL OR "type" = 'DEFECT');

-- Sharing is one-way (ADR 0049 D1, 0008 section 4.5): once set, "sharedAt" never changes, never returns to null, and the shared row is never deleted
-- (a delete would unshare it). An unshared item is untouched by this trigger. ENABLE ALWAYS, as the trail's triggers, so no session role skips it.
CREATE FUNCTION public."work_item_shared_one_way"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% on "WorkItem" is refused: the item is shared with the contractor, and sharing is one-way', TG_OP
    USING ERRCODE = 'PA055', HINT = 'ADR 0049 D1. A shared item is never unshared, re-shared at another instant, or deleted.';
END
$$;
CREATE TRIGGER "WorkItem_shared_one_way" BEFORE UPDATE ON "WorkItem" FOR EACH ROW
  WHEN (OLD."sharedAt" IS NOT NULL AND NEW."sharedAt" IS DISTINCT FROM OLD."sharedAt") EXECUTE FUNCTION public."work_item_shared_one_way"();
CREATE TRIGGER "WorkItem_shared_not_deleted" BEFORE DELETE ON "WorkItem" FOR EACH ROW
  WHEN (OLD."sharedAt" IS NOT NULL) EXECUTE FUNCTION public."work_item_shared_one_way"();
ALTER TABLE "WorkItem" ENABLE ALWAYS TRIGGER "WorkItem_shared_one_way";
ALTER TABLE "WorkItem" ENABLE ALWAYS TRIGGER "WorkItem_shared_not_deleted";


-- ------------------------------------------------------------------ the comment's CHECKs (B-2, B-8)

-- Replaces 3a's "WorkItemComment_by_person": exactly one writer, a person or a contractor's account.
ALTER TABLE "WorkItemComment" DROP CONSTRAINT "WorkItemComment_by_person";
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_one_writer" CHECK (num_nonnulls("personId", "supplierAccountId") = 1);
-- A contractor's comment is always a Reply.
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_contractor_replies" CHECK ("supplierAccountId" IS NULL OR NOT "internal");

-- The plan's optional backstop (ADR 0048 D4 in the database): a Reply is written only on an item shared at or before the comment's instant, so a
-- comment written while the item was internal can never be one the contractor reads. The act writes the share before (or with) its first Reply.
CREATE FUNCTION public."work_item_comment_reply_when_shared"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."WorkItem" i WHERE i."id" = NEW."workItemId" AND i."sharedAt" IS NOT NULL AND i."sharedAt" <= NEW."recordedAt") THEN
    RAISE EXCEPTION 'INSERT on "WorkItemComment" is refused: a reply (internal = false) needs an item shared at or before it'
      USING ERRCODE = 'PA056', HINT = 'ADR 0048 D4, ADR 0049 D1. On an unshared item every comment is internal.';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "WorkItemComment_reply_when_shared" BEFORE INSERT ON "WorkItemComment" FOR EACH ROW
  WHEN (NOT NEW."internal") EXECUTE FUNCTION public."work_item_comment_reply_when_shared"();
ALTER TABLE "WorkItemComment" ENABLE ALWAYS TRIGGER "WorkItemComment_reply_when_shared";


-- ------------------------------------------------------------------ PA047 widened to a live work item file (B-6, WB-4)

-- PA047, replaced whole from 20261202000000, with one arm added last: a store version held by a live (not detached) attachment on a work item is not
-- withdrawn either, whether or not the item is shared (the rule is unconditional, so it never reads "sharedAt"). A detached pin holds nothing.
-- The trigger itself (BEFORE UPDATE OF "withdrawnAt", ENABLE ALWAYS) is not recreated.
CREATE OR REPLACE FUNCTION public."document_version_project_file_kept"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."DocumentAttachment" a
              WHERE a."versionId" = NEW."id"
                AND ((a."projectDocumentVersionId" IS NOT NULL AND a."detachedAt" IS NULL) OR a."awardOnlineReturnId" IS NOT NULL
                     OR (a."workItemId" IS NOT NULL AND a."detachedAt" IS NULL))) THEN
    RAISE EXCEPTION 'UPDATE on "DocumentVersion" is refused: this version is a project file, a work item''s file or the scan of an online award return, and is kept'
      USING ERRCODE = 'PA047', HINT = 'ADR 0042 (PW-33), ADR 0045 D1, ADR 0049 D3. A project file is replaced by a new version of the project document, and a work item''s file is removed from an unshared item first.';
  END IF;
  RETURN NEW;
END
$$;


-- ------------------------------------------------------------------ the staff notice kinds, the CHECK replaced whole

-- Workspace 3b (B-17): one new kind, "From the contractor". From 20261210000900, with it added last.
-- The kinds are in STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts) and a source test holds this, the latest definition, to that list.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM', 'INDENT_EXPIRED', 'COMMENCEMENT_LATE', 'PROJECT_DOCUMENT_TO_APPROVE', 'PROJECT_DOCUMENT_FROM_CONTRACTOR', 'PROJECT_DOCUMENT_REQUESTED', 'AWARD_RETURN_LODGED', 'AWARD_QUERY_RAISED', 'DLP_ENDING', 'DEFECT_RECTIFIED', 'WORK_ITEM_ASSIGNED', 'WORK_ITEM_TO_CHECK', 'WORK_ITEM_RETURNED', 'WORK_ITEM_COMMENT', 'WORK_ITEM_FROM_CONTRACTOR')) IS TRUE);
