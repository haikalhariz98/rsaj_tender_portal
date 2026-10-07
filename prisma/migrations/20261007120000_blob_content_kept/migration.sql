-- Phase 1d review (OD-9): stored document bytes are never changed, by any database login.
--
-- The DocumentVersion trigger freezes a version row, sha256 included, but the bytes live in BlobContent, which had no trigger.
-- An UPDATE of "bytes" would have replaced the evidence a version points at. Every reader re-hashes and refuses a mismatch, so a
-- substitute is never served as the original, but the original would be gone. This refuses UPDATE and TRUNCATE for every login,
-- the owner and a superuser included, and ENABLE ALWAYS keeps it firing under session_replication_role = replica.
-- DELETE is not refused here: an orphan (bytes no version points at) may be cleared, and DocumentVersion's foreign key (RESTRICT)
-- already holds every blob a version points at.
--   PA004  stored bytes are never changed
-- Existing rows are not touched or checked.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   DROP TRIGGER "BlobContent_no_truncate" ON "BlobContent"
--   DROP TRIGGER "BlobContent_kept" ON "BlobContent"
--   DROP FUNCTION "refuse_blob_change"()

CREATE FUNCTION "refuse_blob_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on "BlobContent" is refused: stored document bytes are never changed', TG_OP
    USING ERRCODE = 'PA004', HINT = 'OD-9. Upload a new version instead. An orphan may be deleted, never rewritten.';
END
$$;

CREATE TRIGGER "BlobContent_kept" BEFORE UPDATE ON "BlobContent" FOR EACH ROW EXECUTE FUNCTION "refuse_blob_change"();
CREATE TRIGGER "BlobContent_no_truncate" BEFORE TRUNCATE ON "BlobContent" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_blob_change"();
ALTER TABLE "BlobContent" ENABLE ALWAYS TRIGGER "BlobContent_kept";
ALTER TABLE "BlobContent" ENABLE ALWAYS TRIGGER "BlobContent_no_truncate";
