-- ADR 0042, the Project workspace security audit's fix round (rulings PW-33, PW-37, PW-39, PW-42 of 2026-10-23). One additive folder, no row written.
--   PW-33 (audit M1)  a store version held by a live PROJECT_DOCUMENT_FILE attachment is never withdrawn. New trigger, SQLSTATE PA047, ENABLE ALWAYS.
--   PW-37 (audit L4)  a store version is pinned to one project version only. A partial unique index on DocumentAttachment(versionId), raw SQL as Prisma
--                     declares no partial index (precedent DocumentAttachment_onlineBidFileId_key, and ProjectDocumentApprover_one_live_per_person).
--   PW-39 (audit L6)  PA041 and PA042 gain PA046's join. A contractor-side uploading or requesting account is the contract's awardee's (Award.vendorId).
--                     Both functions are replaced whole from 20261122000100. Every earlier rule is kept word for word, the new rule is added after the
--                     side rule, and the triggers themselves (already ENABLE ALWAYS) are not recreated.
-- An existing row that breaks a new rule fails the migration (PW-42). Nothing is repaired here: a repair needs the founder.

-- ------------------------------------------------------------------ pre-checks (each raises, and then nothing is changed)

-- PW-33: no version held by a live project file is already withdrawn.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public."DocumentAttachment" a JOIN public."DocumentVersion" v ON v."id" = a."versionId"
   WHERE a."purpose" = 'PROJECT_DOCUMENT_FILE' AND a."detachedAt" IS NULL AND v."withdrawnAt" IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Pre-check failed (PW-33): % project file(s) are held by a live attachment on a withdrawn store version. Nothing was changed. A repair needs the founder.', n;
  END IF;
END
$$;

-- PW-37: no store version is pinned twice as a project file (detached pins counted too, as the index counts them).
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM (SELECT a."versionId" FROM public."DocumentAttachment" a WHERE a."purpose" = 'PROJECT_DOCUMENT_FILE' GROUP BY a."versionId" HAVING count(*) > 1) q;
  IF n > 0 THEN
    RAISE EXCEPTION 'Pre-check failed (PW-37): % store version(s) are pinned to more than one project version. Nothing was changed. A repair needs the founder.', n;
  END IF;
END
$$;

-- PW-39: every contractor-side version and request already written names an account of its contract's awardee.
DO $$
DECLARE
  n_versions integer;
  n_requests integer;
BEGIN
  SELECT count(*) INTO n_versions FROM public."ProjectDocumentVersion" v
   WHERE v."uploadedBySupplierAccountId" IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public."SupplierAccount" s JOIN public."ProjectDocument" d ON d."id" = v."documentId" JOIN public."Contract" c ON c."id" = d."contractId"
       JOIN public."Award" w ON w."id" = c."awardId"
      WHERE s."id" = v."uploadedBySupplierAccountId" AND s."organisationId" = v."organisationId" AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId");
  SELECT count(*) INTO n_requests FROM public."ProjectDocumentRequest" r
   WHERE r."requestedBySupplierAccountId" IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public."SupplierAccount" s JOIN public."ProjectDocument" d ON d."id" = r."documentId" JOIN public."Contract" c ON c."id" = d."contractId"
       JOIN public."Award" w ON w."id" = c."awardId"
      WHERE s."id" = r."requestedBySupplierAccountId" AND s."organisationId" = r."organisationId" AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId");
  IF n_versions > 0 OR n_requests > 0 THEN
    RAISE EXCEPTION 'Pre-check failed (PW-39): % version(s) and % request(s) name a portal account that is not the contract awardee''s. Nothing was changed. A repair needs the founder.', n_versions, n_requests;
  END IF;
END
$$;


-- ------------------------------------------------------------------ PW-37: one pin per store version

-- A store version is the file of one project version only, ever (a detached pin still holds it). Other purposes are not limited here.
CREATE UNIQUE INDEX "DocumentAttachment_project_file_one_pin" ON "DocumentAttachment"("versionId") WHERE "purpose" = 'PROJECT_DOCUMENT_FILE';


-- ------------------------------------------------------------------ PW-33: a project file is kept (PA047)

-- PA047: a store version held by a live project file (purpose PROJECT_DOCUMENT_FILE, not detached) is not withdrawn. A project file is replaced only by a
-- new version (PW-7, PW-8). The withdrawal's own rules (once, with a reason, nothing else changed) stay with "DocumentVersion_guard" (PA003), which fires
-- first because BEFORE triggers of one event fire in name order. TRUNCATE is already refused on the table by "DocumentVersion_no_truncate".
CREATE FUNCTION public."document_version_project_file_kept"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."DocumentAttachment" a
              WHERE a."versionId" = NEW."id" AND a."purpose" = 'PROJECT_DOCUMENT_FILE' AND a."detachedAt" IS NULL) THEN
    RAISE EXCEPTION 'UPDATE on "DocumentVersion" is refused: this version is a project file, and a project file is kept'
      USING ERRCODE = 'PA047', HINT = 'ADR 0042 (PW-33). Send a new version of the project document instead.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "DocumentVersion_project_file_kept" BEFORE UPDATE OF "withdrawnAt" ON "DocumentVersion" FOR EACH ROW
  WHEN (OLD."withdrawnAt" IS NULL AND NEW."withdrawnAt" IS NOT NULL) EXECUTE FUNCTION public."document_version_project_file_kept"();
ALTER TABLE "DocumentVersion" ENABLE ALWAYS TRIGGER "DocumentVersion_project_file_kept";


-- ------------------------------------------------------------------ PW-39: PA041 and PA042 replaced whole, with PA046's join

-- PA041: a version comes from its document's side (PW-8): a portal account on a CONTRACTOR document, a staff person on an ORGANISATION one. It is the
-- next number, in its document's organisation, and the request it answers is its own document's, still open. PW-39: the portal account is the awardee's.
CREATE OR REPLACE FUNCTION public."project_document_version_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doc_side "ProjectSide";
  doc_org text;
  doc_contract text;
  next_number integer;
BEGIN
  SELECT d."side", d."organisationId", d."contractId" INTO doc_side, doc_org, doc_contract FROM "ProjectDocument" d WHERE d."id" = NEW."documentId";
  IF doc_org IS DISTINCT FROM NEW."organisationId" THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: a version is filed under its document''s organisation'
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1.';
  END IF;
  IF (doc_side = 'CONTRACTOR' AND NEW."uploadedBySupplierAccountId" IS NULL) OR (doc_side = 'ORGANISATION' AND NEW."uploadedByPersonId" IS NULL) THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: a version comes from its document''s side'
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1 (PW-8). The contractor uploads to a contractor document, the organisation to its own.';
  END IF;
  IF NEW."uploadedBySupplierAccountId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "SupplierAccount" s JOIN "Contract" c ON c."id" = doc_contract JOIN "Award" w ON w."id" = c."awardId"
        WHERE s."id" = NEW."uploadedBySupplierAccountId" AND s."organisationId" = NEW."organisationId" AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId") THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentVersion" is refused: a contractor''s version is uploaded by an account of the contract''s awardee'
      USING ERRCODE = 'PA041', HINT = 'ADR 0042 D1 (PW-17, PW-39).';
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

-- PA042: a request goes to its document's side, from the other side (PW-5, PW-30), in its document's organisation, and only while no other request
-- on the document is open (one that no version names). PW-39: a portal account asking is the awardee's.
CREATE OR REPLACE FUNCTION public."project_document_request_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  doc_side "ProjectSide";
  doc_org text;
  doc_contract text;
BEGIN
  SELECT d."side", d."organisationId", d."contractId" INTO doc_side, doc_org, doc_contract FROM "ProjectDocument" d WHERE d."id" = NEW."documentId";
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
  IF NEW."requestedBySupplierAccountId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "SupplierAccount" s JOIN "Contract" c ON c."id" = doc_contract JOIN "Award" w ON w."id" = c."awardId"
        WHERE s."id" = NEW."requestedBySupplierAccountId" AND s."organisationId" = NEW."organisationId" AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId") THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentRequest" is refused: a contractor''s request is made by an account of the contract''s awardee'
      USING ERRCODE = 'PA042', HINT = 'ADR 0042 D1 (PW-17, PW-39).';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProjectDocumentRequest" r WHERE r."documentId" = NEW."documentId"
             AND NOT EXISTS (SELECT 1 FROM "ProjectDocumentVersion" v WHERE v."requestId" = r."id")) THEN
    RAISE EXCEPTION 'INSERT on "ProjectDocumentRequest" is refused: the document already has an open request'
      USING ERRCODE = 'PA042', HINT = 'ADR 0042 D1. A request is open until a version answers it.';
  END IF;
  RETURN NEW;
END
$$;
