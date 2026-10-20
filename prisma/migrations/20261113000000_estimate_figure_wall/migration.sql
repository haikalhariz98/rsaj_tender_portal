-- Go-live item N6 (threat model F10, ruling 20ch): the sealed company estimate's database wall, step 1. Migrations through 20261112000000 are applied, so nothing in them is edited.
--
-- 1. The access log gains a granting basis, LOGGED_FIGURE_READ: the figure was read through the database's logged reader below. The outcome-paired CHECK is rebuilt with it added to the
--    GRANTED list, and every other value is exactly as 20261013100000 left it. The CHECK is rebuilt wider, so no existing row can break it and no pre-check is needed. The list stays the code's
--    (SULIT_GRANT_BASES in src/lib/auth/sulit-access.ts) and a source test holds the last migration that writes this CHECK to it.
-- 2. public.read_company_estimate_figure is the one way the app role reads CompanyEstimateVersion.value once npm run db:roles walls the column off. It is SECURITY DEFINER, so it reads as its
--    owner, pins search_path and schema-qualifies every name. It reads the version by id within the organisation, refuses an unknown one with SQLSTATE PA035 and writes nothing, and otherwise
--    writes one SulitAccessEvent row (GRANTED, LOGGED_FIGURE_READ, field companyEstimate) in the caller's transaction before it returns the figure. The one_actor CHECK judges the actor columns.
--    It holds no state precondition. The lodge and disclose rules stay the application's (plan golive-n6 J4). Residual, recorded in F10 and not closed here: the row is written in the caller's
--    transaction, so a caller able to run arbitrary SQL as the app role can call the reader and roll its own row back.
-- 3. EXECUTE is revoked from PUBLIC. It is granted to the app role by db:roles (grantStatements), because the role's name is a deployment fact and not a migration's.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line. The old CHECK refuses to come back while any row carries
-- LOGGED_FIGURE_READ, and those rows are evidence and stay, so a database that has logged a read is not reversed past this migration.
--   DROP FUNCTION public.read_company_estimate_figure(text, text, text, text, text, text)
--   ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_basis_matches_outcome"
--   ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK, with the GRANTED and WITHHELD lists exactly as 20261013100000 wrote them

ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_basis_matches_outcome";
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK ((("outcome" = 'GRANTED' AND "basis" IN ('NAMED_ON_RECORD', 'ORGANISATION_PERMISSION', 'IN_CUSTODY', 'SECRETARIAT_OFFICE', 'INTERNAL_AUDIT_OFFICE', 'CREDITOR_PROFILE_PERMISSION', 'OWN_RECORD', 'LOGGED_FIGURE_READ')) OR ("outcome" = 'WITHHELD' AND "basis" IN ('ADMINISTRATOR', 'NOT_A_PERSON', 'RESTRICTED_NOT_NAMED', 'NOT_NAMED_PERMISSION_UNDECIDED', 'NOT_NAMED_PERMISSION_WITHHELD', 'NOT_NAMED_PERMISSION_SCOPED', 'NOT_NAMED_PERMISSION_NOT_HELD', 'FIELD_NOT_FOR_THIS_RECORD', 'SEALED', 'CUSTODY_NOT_SET', 'NOT_IN_CUSTODY', 'CUSTODY_DAY_UNKNOWN'))) IS TRUE);

CREATE FUNCTION public.read_company_estimate_figure(
  p_organisation_id text, p_version_id text,
  p_actor_person_id text, p_actor_system_label text, p_actor_session_id text, p_source_address text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  figure numeric;
  version_no integer;
  exercise_reference text;
BEGIN
  SELECT v."value", v."versionNo", x."reference" INTO figure, version_no, exercise_reference
    FROM public."CompanyEstimateVersion" v
    JOIN public."CompanyEstimate" e ON e."id" = v."estimateId"
    JOIN public."SourcingExercise" x ON x."id" = e."exerciseId"
   WHERE v."id" = p_version_id AND v."organisationId" = p_organisation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'read of company estimate version % in organisation % is refused: there is no such version', p_version_id, p_organisation_id
      USING ERRCODE = 'PA035', HINT = 'Threat model F10, ruling 20ch. The figure is read by version within its organisation, and nothing is logged for a version that is not there.';
  END IF;

  INSERT INTO public."SulitAccessEvent" ("id", "organisationId", "actorPersonId", "actorSystemLabel", "actorSessionId", "sourceAddress", "scope", "entity", "entityId", "entityLabel", "fields", "outcome", "basis", "at")
  VALUES (pg_catalog.gen_random_uuid()::text, p_organisation_id, p_actor_person_id, p_actor_system_label, p_actor_session_id, p_source_address,
          'exercise', 'CompanyEstimateVersion', p_version_id, exercise_reference || ' · Company estimate · version ' || version_no::text,
          ARRAY['companyEstimate']::text[], 'GRANTED'::public."SulitOutcome", 'LOGGED_FIGURE_READ', pg_catalog.now());

  RETURN figure;
END;
$$;

REVOKE ALL ON FUNCTION public.read_company_estimate_figure(text, text, text, text, text, text) FROM PUBLIC;
