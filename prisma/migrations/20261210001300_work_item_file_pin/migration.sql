-- Workspace 3b-i security audit (WSEC-10 L5, WB-4): a database trigger backs up the pin on a work item's file. A work item's file is kept (PA047) and is never removed from a
-- shared item: the contractor may hold it, and a correction is a new file and a reply. The application already enforces both. This refuses them in the database too, so no later
-- code path or hand-run statement can move a file across the share line.
--   * "attachedAt" and "workItemId" never change. The portal lists a file by when it was attached against the item's "sharedAt" (WB-3), so changing either could make a staff-only
--     file visible to the contractor, or move a file to another item.
--   * a pin cannot be detached while its item is shared ("detachedAt" set for the first time). Detaching is the only way a pin leaves the list, and removal is for unshared items only.
-- Additive: one function and one trigger, no column, no backfill, no change to any existing row. A work item's file is the only attachment it looks at (WHEN names the work item
-- column, which the purpose CHECK ties to that purpose alone), so every other attachment is untouched. ENABLE ALWAYS, as the sharing triggers, so no session role skips it. The code is PA057.
CREATE FUNCTION public."document_attachment_work_item_file_pinned"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW."attachedAt" IS DISTINCT FROM OLD."attachedAt" OR NEW."workItemId" IS DISTINCT FROM OLD."workItemId" THEN
    RAISE EXCEPTION 'UPDATE on "DocumentAttachment" is refused: when a work item''s file was attached, and which item it is on, never change'
      USING ERRCODE = 'PA057', HINT = 'ADR 0049 D3, WB-3. The portal lists a file by when it was attached against when the item was shared.';
  END IF;
  IF OLD."detachedAt" IS NULL AND NEW."detachedAt" IS NOT NULL
     AND EXISTS (SELECT 1 FROM public."WorkItem" i WHERE i."id" = OLD."workItemId" AND i."sharedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'UPDATE on "DocumentAttachment" is refused: a file on a shared work item is not removed'
      USING ERRCODE = 'PA057', HINT = 'ADR 0049 D3, WB-4. The contractor may hold it, and a correction is a new file and a reply.';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "DocumentAttachment_work_item_file_pinned" BEFORE UPDATE ON "DocumentAttachment" FOR EACH ROW
  WHEN (OLD."workItemId" IS NOT NULL) EXECUTE FUNCTION public."document_attachment_work_item_file_pinned"();
ALTER TABLE "DocumentAttachment" ENABLE ALWAYS TRIGGER "DocumentAttachment_work_item_file_pinned";
