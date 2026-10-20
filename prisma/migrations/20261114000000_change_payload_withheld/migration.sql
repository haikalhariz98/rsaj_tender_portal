-- Go-live item N7 (PDPA, plan docs/notes/plans/golive-n7.md section 3.4): the contractor signatory's personal values are blanked in a decided return correction's payload.
-- The ruling on open item 2030 (decisions-log line 2047) chose "blank at the decision", and the product owner scoped N7 to it (line 2823). Migrations through
-- 20261113000000 are applied, so nothing in them is edited.
--
-- public.guard_configuration_change is replaced. Its four refusals stay word for word. The column compare now leaves "payload" out, and a new block judges a payload
-- difference. It is allowed only when every one of these holds, and anything else is refused with SQLSTATE PA004:
--   1. it is the deciding UPDATE (OLD PROPOSED and NEW not), which the earlier refusals already hold, so a row decided before this migration is never blanked
--   2. the kind is AWARD_RETURN_CORRECTION and the operation is awards-records.recordReturn
--   3. every key of the payload other than fields is unchanged, the operation included
--   4. both fields are arrays of the same length, and each element keeps its position and its name
--   5. each changed element was a [name, text] pair whose name is listed, and it became [name, null]
-- The list is RETURN_WITHHELD_FIELDS in src/lib/award/return-withheld.ts, and src/lib/auth/change-withheld.db.test.ts loops over it and over RETURN_KEPT_FIELDS.
--
-- CREATE OR REPLACE drops the search_path that 20261103200000 pinned with ALTER FUNCTION, so the SET is in the function's own text and every function is schema-qualified.
-- It reads no table. The triggers ConfigurationChange_guard and ConfigurationChange_no_truncate are not recreated: they stay bound to the function and ENABLE ALWAYS.
-- No statement here reads or writes a row of "ConfigurationChange".
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations): CREATE OR REPLACE FUNCTION public."guard_configuration_change"() with the
-- body of 20261007160000_two_person_guards exactly, followed by ALTER FUNCTION public."guard_configuration_change"() SET search_path = pg_catalog, public, pg_temp
-- as 20261103200000 wrote it. Payloads already blanked stay blanked and are valid under the old guard, which never judges a decided row's payload.

CREATE OR REPLACE FUNCTION public."guard_configuration_change"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  withheld CONSTANT text[] := ARRAY['signatoryName', 'icNumber', 'occupation', 'address', 'witnessName'];
  old_fields jsonb;
  new_fields jsonb;
  old_el jsonb;
  new_el jsonb;
  i integer;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION '% on "ConfigurationChange" is refused: a change is kept for good', TG_OP
      USING ERRCODE = 'PA004', HINT = 'ADR 0034 D15. A change that was proposed stays on the record, whatever became of it.';
  END IF;
  IF OLD."status" <> 'PROPOSED' THEN
    RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: the change was already decided (%)', OLD."status"
      USING ERRCODE = 'PA004', HINT = 'A decided change is never changed. Propose it again.';
  END IF;
  IF NEW."status" = 'PROPOSED' THEN
    RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: the only change a proposal takes is its decision'
      USING ERRCODE = 'PA004';
  END IF;
  IF (pg_catalog.to_jsonb(NEW) - 'status' - 'decidedByPersonId' - 'decidedAt' - 'decisionReason' - 'payload') <> (pg_catalog.to_jsonb(OLD) - 'status' - 'decidedByPersonId' - 'decidedAt' - 'decisionReason' - 'payload') THEN
    RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: what was proposed is never changed after the proposal'
      USING ERRCODE = 'PA004', HINT = 'Only the decision is written: its status, who decided, when and why.';
  END IF;

  -- N7: the one payload change a decision may carry is the blank of the listed personal values of a return correction.
  IF NEW."payload" IS DISTINCT FROM OLD."payload" THEN
    IF (OLD."kind"::text = 'AWARD_RETURN_CORRECTION' AND (OLD."payload" ->> 'operation') = 'awards-records.recordReturn') IS NOT TRUE THEN
      RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: only a return correction''s personal values are blanked at its decision'
        USING ERRCODE = 'PA004', HINT = 'Go-live N7, ruling on open item 2030. Every other payload is never changed after the proposal.';
    END IF;
    IF ((NEW."payload" - 'fields') = (OLD."payload" - 'fields')) IS NOT TRUE THEN
      RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: the blank changes nothing but field values, never the operation or another key'
        USING ERRCODE = 'PA004', HINT = 'Go-live N7, ruling on open item 2030.';
    END IF;
    old_fields := OLD."payload" -> 'fields';
    new_fields := NEW."payload" -> 'fields';
    IF (pg_catalog.jsonb_typeof(old_fields) = 'array' AND pg_catalog.jsonb_typeof(new_fields) = 'array') IS NOT TRUE THEN
      RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: the blank keeps the fields a list'
        USING ERRCODE = 'PA004', HINT = 'Go-live N7, ruling on open item 2030.';
    END IF;
    IF pg_catalog.jsonb_array_length(old_fields) <> pg_catalog.jsonb_array_length(new_fields) THEN
      RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: the blank keeps every field, none added or removed'
        USING ERRCODE = 'PA004', HINT = 'Go-live N7, ruling on open item 2030.';
    END IF;
    FOR old_el, new_el, i IN
      SELECT o.value, n.value, o.ordinality::integer
        FROM pg_catalog.jsonb_array_elements(old_fields) WITH ORDINALITY AS o
        JOIN pg_catalog.jsonb_array_elements(new_fields) WITH ORDINALITY AS n ON n.ordinality = o.ordinality
       ORDER BY o.ordinality
    LOOP
      CONTINUE WHEN new_el = old_el;
      IF (pg_catalog.jsonb_typeof(old_el) = 'array' AND pg_catalog.jsonb_typeof(new_el) = 'array') IS NOT TRUE THEN
        RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: field % is not a name and a value', i
          USING ERRCODE = 'PA004', HINT = 'Go-live N7, ruling on open item 2030.';
      END IF;
      IF (pg_catalog.jsonb_array_length(old_el) = 2
          AND pg_catalog.jsonb_array_length(new_el) = 2
          AND (new_el -> 0) = (old_el -> 0)
          AND pg_catalog.jsonb_typeof(old_el -> 0) = 'string'
          AND (old_el ->> 0) = ANY (withheld)
          AND pg_catalog.jsonb_typeof(old_el -> 1) = 'string'
          AND (new_el -> 1) = 'null'::jsonb) IS NOT TRUE THEN
        RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: field % may only have a listed personal value blanked, in place, under its own name', i
          USING ERRCODE = 'PA004', HINT = 'Go-live N7, ruling on open item 2030. The withheld marker is JSON null, and it replaces a text value only.';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END
$$;
