-- Wave V security review fix round (2026-10-24): L1, the scans of an online return are kept, and L2, a question asked twice with the same key is one
-- question. Additive only: one new nullable column with its unique index, and PA047's function replaced whole. No existing row is written, changed or
-- deleted, and every existing row already satisfies the index (the column is null on each, and nulls are distinct).

-- AlterTable
ALTER TABLE "AwardQuery" ADD COLUMN     "requestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AwardQuery_awardId_requestKey_key" ON "AwardQuery"("awardId", "requestKey");


-- ------------------------------------------------------------------ PA047 widened to the online return's scans (L1)

-- PA047, replaced whole from 20261201000100: a store version held by a live attachment on a project version, or by an online award return (waiting,
-- verified or refused), is not withdrawn. An online return's scans are never detached (PA051 freezes a decided return's), so every such pin holds.
-- The trigger itself (ENABLE ALWAYS) is not recreated.
CREATE OR REPLACE FUNCTION public."document_version_project_file_kept"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."DocumentAttachment" a
              WHERE a."versionId" = NEW."id"
                AND ((a."projectDocumentVersionId" IS NOT NULL AND a."detachedAt" IS NULL) OR a."awardOnlineReturnId" IS NOT NULL)) THEN
    RAISE EXCEPTION 'UPDATE on "DocumentVersion" is refused: this version is a project file or the scan of an online award return, and is kept'
      USING ERRCODE = 'PA047', HINT = 'ADR 0042 (PW-33), ADR 0045 D1. A project file is replaced by a new version of the project document.';
  END IF;
  RETURN NEW;
END
$$;
