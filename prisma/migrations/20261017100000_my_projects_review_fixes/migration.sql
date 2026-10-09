-- Phase 4e review fixes: who may sign for a contractor from the portal, a day only on the kinds that carry one, and the
-- portal's signed and sent records frozen in the database as they are on screen.

-- AlterTable
ALTER TABLE "PostAwardPolicy" ADD COLUMN     "contractorPortalSigning" BOOLEAN,
ADD COLUMN     "contractorPortalSigningProvenance" "Provenance";

-- ---------------------------------------------------------------------------------------------------------------------------------
-- A submission's day is carried only by an interim claim, a materials-on-site list and a notice of a cause of delay (the rules refuse
-- it on the others, and this holds any other writer to the same). Pre-check: a row that already breaks it stops the migration by name,
-- rather than the constraint failing on an unnamed row.
-- ---------------------------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad FROM "ContractorSubmission" WHERE "aboutDay" IS NOT NULL AND "kind" NOT IN ('INTERIM_CLAIM', 'MATERIALS_ON_SITE', 'DELAY_NOTICE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'ContractorSubmission_day_kind: % submission(s) carry a day on a kind that takes none', bad
      USING HINT = 'Read them with: SELECT id, kind, "aboutDay" FROM "ContractorSubmission" WHERE "aboutDay" IS NOT NULL AND kind NOT IN (''INTERIM_CLAIM'', ''MATERIALS_ON_SITE'', ''DELAY_NOTICE''). A sent submission is frozen, so the owner decides what to do with each before this runs.';
  END IF;
END
$$;

ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_day_kind" CHECK ("aboutDay" IS NULL OR "kind" IN ('INTERIM_CLAIM', 'MATERIALS_ON_SITE', 'DELAY_NOTICE'));

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Triggers, written by hand as 4b's were. Each refuses whoever runs it, the owner included, and ENABLE ALWAYS keeps it firing when a
-- session sets session_replication_role to replica.
--   PA008  a contractor's submission is frozen as sent: answered once, never changed or removed, and its lines with it
--   PA009  what a contractor signed or recorded from its own portal account is kept as it was recorded
-- Nothing existing is judged: the submission tables carry only what the portal wrote, and the diary and signature triggers judge a row
-- only once the portal's column on it is set.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   DROP TRIGGER "ContractorSubmission_frozen_once_sent" ON "ContractorSubmission"
--   DROP TRIGGER "ContractorSubmission_no_truncate" ON "ContractorSubmission"
--   DROP TRIGGER "ContractorSubmissionLine_frozen_once_sent" ON "ContractorSubmissionLine"
--   DROP TRIGGER "ContractorSubmissionLine_no_truncate" ON "ContractorSubmissionLine"
--   DROP TRIGGER "SiteDiaryEntry_portal_acts_kept" ON "SiteDiaryEntry"
--   DROP TRIGGER "CertificateSignature_portal_signature_kept" ON "CertificateSignature"
--   DROP FUNCTION "contractor_submission_frozen"()
--   DROP FUNCTION "contractor_submission_line_frozen"()
--   DROP FUNCTION "site_diary_portal_acts_kept"()
--   DROP FUNCTION "certificate_signature_portal_kept"()
--   ALTER TABLE "ContractorSubmission" DROP CONSTRAINT "ContractorSubmission_day_kind"
--   ALTER TABLE "PostAwardPolicy" DROP COLUMN "contractorPortalSigning", DROP COLUMN "contractorPortalSigningProvenance"
-- ---------------------------------------------------------------------------------------------------------------------------------

-- A submission: never removed. Changed only by its one answer, which moves the five answer columns from nothing to the answer, together,
-- and leaves everything the contractor sent as it was sent.
CREATE FUNCTION "contractor_submission_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on "ContractorSubmission" is refused: a submission that was sent is kept'
      USING ERRCODE = 'PA008', HINT = 'A submission is the contractor''s record of what it sent. It is answered, never removed.';
  END IF;
  IF (to_jsonb(NEW) - 'outcome' - 'outcomeNote' - 'decidedByPersonId' - 'decidedOn' - 'decidedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'outcome' - 'outcomeNote' - 'decidedByPersonId' - 'decidedOn' - 'decidedAt') THEN
    RAISE EXCEPTION 'UPDATE on "ContractorSubmission" is refused: what the contractor sent never changes'
      USING ERRCODE = 'PA008', HINT = 'A submission is frozen as sent. A correction is a new submission.';
  END IF;
  IF OLD."outcome" IS NOT NULL OR OLD."decidedByPersonId" IS NOT NULL OR OLD."decidedOn" IS NOT NULL OR OLD."decidedAt" IS NOT NULL OR OLD."outcomeNote" <> '' THEN
    RAISE EXCEPTION 'UPDATE on "ContractorSubmission" is refused: it was answered already'
      USING ERRCODE = 'PA008', HINT = 'A submission is answered once.';
  END IF;
  IF NEW."outcome" IS NULL OR NEW."decidedByPersonId" IS NULL OR NEW."decidedOn" IS NULL OR NEW."decidedAt" IS NULL THEN
    RAISE EXCEPTION 'UPDATE on "ContractorSubmission" is refused: an answer names its outcome, the officer, the day and the instant together'
      USING ERRCODE = 'PA008', HINT = 'A submission is answered once, whole.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ContractorSubmission_frozen_once_sent" BEFORE UPDATE OR DELETE ON "ContractorSubmission" FOR EACH ROW EXECUTE FUNCTION "contractor_submission_frozen"();
CREATE TRIGGER "ContractorSubmission_no_truncate" BEFORE TRUNCATE ON "ContractorSubmission" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "ContractorSubmission" ENABLE ALWAYS TRIGGER "ContractorSubmission_frozen_once_sent";
ALTER TABLE "ContractorSubmission" ENABLE ALWAYS TRIGGER "ContractorSubmission_no_truncate";

-- A materials list's lines: written with their submission, in the transaction that sent it, and never after. The submission's row was
-- written by this transaction where its row version is this transaction's own and it is not answered (its one change, the answer,
-- makes a new row version with the outcome set, so a later transaction that answers it cannot add a line either).
CREATE FUNCTION "contractor_submission_line_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mine boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% on "ContractorSubmissionLine" is refused: a materials list is frozen as sent', TG_OP
      USING ERRCODE = 'PA008', HINT = 'A correction is a new submission.';
  END IF;
  SELECT (s."xmin" = pg_current_xact_id()::xid AND s."outcome" IS NULL) INTO mine FROM "ContractorSubmission" s WHERE s."id" = NEW."submissionId";
  IF mine IS NOT TRUE THEN
    RAISE EXCEPTION 'INSERT on "ContractorSubmissionLine" is refused: the submission was sent already'
      USING ERRCODE = 'PA008', HINT = 'A materials list''s lines are written with it, when it is sent, and never after.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ContractorSubmissionLine_frozen_once_sent" BEFORE INSERT OR UPDATE OR DELETE ON "ContractorSubmissionLine" FOR EACH ROW EXECUTE FUNCTION "contractor_submission_line_frozen"();
CREATE TRIGGER "ContractorSubmissionLine_no_truncate" BEFORE TRUNCATE ON "ContractorSubmissionLine" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "ContractorSubmissionLine" ENABLE ALWAYS TRIGGER "ContractorSubmissionLine_frozen_once_sent";
ALTER TABLE "ContractorSubmissionLine" ENABLE ALWAYS TRIGGER "ContractorSubmissionLine_no_truncate";

-- A site diary entry the contractor's agent attested from the portal keeps that attestation (who, the day, the instant and the name), and
-- one it disputed from the portal keeps the disagreement and the day it was escalated. The officers' own columns stay theirs to write.
-- An entry the portal touched is never removed.
CREATE FUNCTION "site_diary_portal_acts_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."agentAttestedBySupplierAccountId" IS NOT NULL OR OLD."disputedBySupplierAccountId" IS NOT NULL THEN
      RAISE EXCEPTION 'DELETE on "SiteDiaryEntry" is refused: the contractor signed or disputed it from its portal account'
        USING ERRCODE = 'PA009', HINT = 'What the contractor recorded from its own account is kept.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."agentAttestedBySupplierAccountId" IS NOT NULL AND (NEW."agentAttestedBySupplierAccountId" IS DISTINCT FROM OLD."agentAttestedBySupplierAccountId" OR NEW."agentAttestedOn" IS DISTINCT FROM OLD."agentAttestedOn" OR NEW."agentAttestedAt" IS DISTINCT FROM OLD."agentAttestedAt" OR NEW."agentName" IS DISTINCT FROM OLD."agentName") THEN
    RAISE EXCEPTION 'UPDATE on "SiteDiaryEntry" is refused: the agent''s attestation was signed from the portal'
      USING ERRCODE = 'PA009', HINT = 'An attestation signed with the contractor''s password is kept as signed.';
  END IF;
  IF OLD."disputedBySupplierAccountId" IS NOT NULL AND (NEW."disputedBySupplierAccountId" IS DISTINCT FROM OLD."disputedBySupplierAccountId" OR NEW."disagreement" IS DISTINCT FROM OLD."disagreement" OR NEW."escalatedOn" IS DISTINCT FROM OLD."escalatedOn") THEN
    RAISE EXCEPTION 'UPDATE on "SiteDiaryEntry" is refused: the disagreement was recorded from the portal'
      USING ERRCODE = 'PA009', HINT = 'A disagreement the contractor recorded from its own account is kept as recorded.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "SiteDiaryEntry_portal_acts_kept" BEFORE UPDATE OR DELETE ON "SiteDiaryEntry" FOR EACH ROW EXECUTE FUNCTION "site_diary_portal_acts_kept"();
ALTER TABLE "SiteDiaryEntry" ENABLE ALWAYS TRIGGER "SiteDiaryEntry_portal_acts_kept";

-- A certificate block the contractor signed, or refused to sign, from its portal account is kept whole: never changed, never removed.
CREATE FUNCTION "certificate_signature_portal_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."signedBySupplierAccountId" IS NOT NULL THEN
    RAISE EXCEPTION '% on "CertificateSignature" is refused: the contractor signed this block from its portal account', TG_OP
      USING ERRCODE = 'PA009', HINT = 'A block signed with the contractor''s password is kept as signed.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "CertificateSignature_portal_signature_kept" BEFORE UPDATE OR DELETE ON "CertificateSignature" FOR EACH ROW EXECUTE FUNCTION "certificate_signature_portal_kept"();
ALTER TABLE "CertificateSignature" ENABLE ALWAYS TRIGGER "CertificateSignature_portal_signature_kept";
