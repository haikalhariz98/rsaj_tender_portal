-- Review of Phase 2c (ADR 0034 D15): two gaps in what the database holds of the two-person rules.
--
-- Nothing is added to a table here. Two triggers judge what is written from now on, and no existing row is touched or checked,
-- so no pre-check is needed (a trigger refuses a write, never a row already stored).
-- Each is ENABLE ALWAYS, so session_replication_role = replica does not switch it off, and it has no bypass: it fails for the table owner too.
-- Their refusals carry the SQLSTATEs of migration 20261007160000:
--   PA004  a two-person change is decided once, and only its decision is ever written
--   PA005  an approval matrix is issued only by someone who did not make it

-- Who made a draft of the approval matrix is what the issue rule judges the issuer against (the guard_matrix_issue trigger reads these rows), so the rows are as
-- fixed as the rule: a maker row is never changed to name someone else, and never deleted while its matrix stands. It goes only with the matrix itself, which is what
-- the foreign key's cascade does when a draft is discarded: by then the parent row is gone, and that is the only delete this allows.
CREATE FUNCTION "guard_matrix_maker"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'UPDATE on "AuthorityMatrixMaker" is refused: who made a draft is never changed'
      USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. The issuer of a draft is judged against these rows.';
  END IF;
  IF EXISTS (SELECT 1 FROM "AuthorityMatrix" WHERE "id" = OLD."matrixId") THEN
    RAISE EXCEPTION 'DELETE on "AuthorityMatrixMaker" is refused: who made a draft is kept as long as the draft is'
      USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. A maker row goes only with the matrix it belongs to.';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER "AuthorityMatrixMaker_guard" BEFORE UPDATE OR DELETE ON "AuthorityMatrixMaker" FOR EACH ROW EXECUTE FUNCTION "guard_matrix_maker"();
ALTER TABLE "AuthorityMatrixMaker" ENABLE ALWAYS TRIGGER "AuthorityMatrixMaker_guard";

-- A change is written as a proposal. A row inserted already decided would show a decision that no one made: the guard of migration 20261007160000 judged only the
-- update that decides a change, so an insert could name any decider. The table's CHECKs still hold who may decide and that a decision is named and dated.
CREATE FUNCTION "guard_configuration_change_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'PROPOSED' THEN
    RAISE EXCEPTION 'INSERT on "ConfigurationChange" is refused: a change is written as a proposal, and decided by an update (%)', NEW."status"
      USING ERRCODE = 'PA004', HINT = 'ADR 0034 D15. A decision is never written in place of a proposal.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ConfigurationChange_insert_guard" BEFORE INSERT ON "ConfigurationChange" FOR EACH ROW EXECUTE FUNCTION "guard_configuration_change_insert"();
ALTER TABLE "ConfigurationChange" ENABLE ALWAYS TRIGGER "ConfigurationChange_insert_guard";
