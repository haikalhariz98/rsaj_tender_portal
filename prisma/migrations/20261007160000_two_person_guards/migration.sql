-- Phase 2c (ADR 0034 D15): the two-person rules, held by the database as well as by the code.
--
-- Nothing is added to a table here. Two triggers judge what is written from now on, and no existing row is touched or checked,
-- so no pre-check is needed (the triggers refuse a write, never a row already stored).
-- Each is ENABLE ALWAYS, so session_replication_role = replica does not switch it off, and it has no bypass: it fails for the table owner too.
-- Their refusals carry their own SQLSTATE, as the trail triggers do:
--   PA004  a two-person change is decided once, and only its decision is ever written
--   PA005  an approval matrix is issued only by someone who did not make it

-- A change that a second person decides: the proposal (kind, payload, snapshot, proposer, time, reason) is never changed, a decided change is final,
-- and nothing is ever deleted. The one UPDATE a row takes is its decision, from PROPOSED to APPLIED, DECLINED, WITHDRAWN or STALE. The CHECKs of the
-- table (migration 20261007130100) hold that the proposer never decides, that a withdrawal is the proposer's own and that a decision is named and dated.
CREATE FUNCTION "guard_configuration_change"() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF (to_jsonb(NEW) - 'status' - 'decidedByPersonId' - 'decidedAt' - 'decisionReason') <> (to_jsonb(OLD) - 'status' - 'decidedByPersonId' - 'decidedAt' - 'decisionReason') THEN
    RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused: what was proposed is never changed after the proposal'
      USING ERRCODE = 'PA004', HINT = 'Only the decision is written: its status, who decided, when and why.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ConfigurationChange_guard" BEFORE UPDATE OR DELETE ON "ConfigurationChange" FOR EACH ROW EXECUTE FUNCTION "guard_configuration_change"();
CREATE TRIGGER "ConfigurationChange_no_truncate" BEFORE TRUNCATE ON "ConfigurationChange" FOR EACH STATEMENT EXECUTE FUNCTION "guard_configuration_change"();
ALTER TABLE "ConfigurationChange" ENABLE ALWAYS TRIGGER "ConfigurationChange_guard";
ALTER TABLE "ConfigurationChange" ENABLE ALWAYS TRIGGER "ConfigurationChange_no_truncate";

-- Issuing an approval matrix: the update that puts a draft into force names the issuer, at least one person is on record as having made the draft,
-- and the issuer is not one of them. Once named, the issuer is never changed. Inserting an issued row is not an issue (a seed or a loader writes
-- history that way, with no issuer), and an issue that was made before sign-in has no issuer and keeps none.
CREATE FUNCTION "guard_matrix_issue"() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF EXISTS (SELECT 1 FROM "AuthorityMatrixMaker" WHERE "matrixId" = NEW."id" AND "personId" = NEW."issuedByPersonId") THEN
      RAISE EXCEPTION 'Issuing an approval matrix is refused: the issuer is one of the people who made the draft'
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. A second person who did not make it issues it.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "AuthorityMatrix_issue_guard" BEFORE UPDATE ON "AuthorityMatrix" FOR EACH ROW EXECUTE FUNCTION "guard_matrix_issue"();
ALTER TABLE "AuthorityMatrix" ENABLE ALWAYS TRIGGER "AuthorityMatrix_issue_guard";
