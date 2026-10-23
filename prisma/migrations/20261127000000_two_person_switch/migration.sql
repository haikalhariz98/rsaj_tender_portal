-- ADR 0043 D3: two-person approval of configuration is an organisation switch. Existing organisations keep it on (the default), and
-- the migration switches no organisation off. The two issue triggers let a maker put a draft in force only while that organisation's
-- switch is off. A missing SecurityPolicy row reads as on. Everything else in them is unchanged, and ENABLE ALWAYS is not touched.
-- The ConfigurationChange guards and CHECKs are not touched either: every row in that table stays a two-person decision.
-- CREATE OR REPLACE resets a function's settings, so each restates the search_path pinned by 20261103200000.
-- Down (by hand): restore both functions from 20261007160000 and 20261018100000 with that search_path, then
-- ALTER TABLE "SecurityPolicy" DROP COLUMN "twoPersonChanges"

-- AlterTable
ALTER TABLE "SecurityPolicy" ADD COLUMN     "twoPersonChanges" BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION "guard_matrix_issue"() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD."issuedByPersonId" IS NOT NULL AND NEW."issuedByPersonId" IS DISTINCT FROM OLD."issuedByPersonId" THEN
    RAISE EXCEPTION 'UPDATE on "AuthorityMatrix" is refused: who issued it is never changed'
      USING ERRCODE = 'PA005';
  END IF;
  IF OLD."issuedAt" IS NULL AND NEW."issuedAt" IS NOT NULL THEN
    IF NEW."issuedByPersonId" IS NULL THEN
      RAISE EXCEPTION 'Issuing an approval matrix is refused: it names no issuer'
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. The person who issues it is recorded.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "AuthorityMatrixMaker" WHERE "matrixId" = NEW."id") THEN
      RAISE EXCEPTION 'Issuing an approval matrix is refused: nobody is on record as having made the draft'
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. Someone adopts the draft first, and then a different person issues it.';
    END IF;
    IF EXISTS (SELECT 1 FROM "AuthorityMatrixMaker" WHERE "matrixId" = NEW."id" AND "personId" = NEW."issuedByPersonId")
       AND COALESCE((SELECT "twoPersonChanges" FROM "SecurityPolicy" WHERE "organisationId" = NEW."organisationId"), true) THEN
      RAISE EXCEPTION 'Issuing an approval matrix is refused: the issuer is one of the people who made the draft'
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15, ADR 0043 D3. While two-person approval is on, a second person who did not make it issues it.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "guard_draft_issue"() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  kind text := TG_ARGV[0];
  was_draft boolean := OLD."status"::text = 'DRAFT';
  now_issued boolean := NEW."status"::text = 'ISSUED';
  issuer text := NEW."issuedByPersonId";
  old_issuer text := OLD."issuedByPersonId";
BEGIN
  IF old_issuer IS NOT NULL AND issuer IS DISTINCT FROM old_issuer THEN
    RAISE EXCEPTION 'UPDATE on "%" is refused: who issued it is never changed', kind
      USING ERRCODE = 'PA005';
  END IF;
  IF was_draft AND now_issued THEN
    IF issuer IS NULL THEN
      RAISE EXCEPTION 'Issuing a % is refused: it names no issuer', kind
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. The person who issues it is recorded.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "ConfigurationDraftMaker" WHERE "entity" = kind AND "entityId" = NEW."id") THEN
      RAISE EXCEPTION 'Issuing a % is refused: nobody is on record as having made the draft', kind
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. Someone edits the draft first, and then a different person issues it.';
    END IF;
    IF EXISTS (SELECT 1 FROM "ConfigurationDraftMaker" WHERE "entity" = kind AND "entityId" = NEW."id" AND "personId" = issuer)
       AND COALESCE((SELECT "twoPersonChanges" FROM "SecurityPolicy" WHERE "organisationId" = NEW."organisationId"), true) THEN
      RAISE EXCEPTION 'Issuing a % is refused: the issuer is one of the people who made the draft', kind
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15, ADR 0043 D3. While two-person approval is on, a second person who did not make it issues it.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
