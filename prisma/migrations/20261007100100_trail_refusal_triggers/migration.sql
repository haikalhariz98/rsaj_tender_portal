-- Phase 1d (ADR 0034 D11, ruling O-1, OD-9): refusal triggers on the trail, with no bypass.
--
-- No database login is let through: each function refuses whoever runs it, the table owner and a superuser included.
-- TRUNCATE skips row triggers, so every guarded table also gets a statement-level TRUNCATE refusal.
-- ENABLE ALWAYS keeps the triggers firing when a session sets session_replication_role to replica.
-- The refusals carry their own SQLSTATE so a caller can tell them from a privilege error (42501) or a foreign key (23001):
--   PA001  the table is append-only (AuditEntry, SignInEvent, and SignInEventDetail apart from an expired delete)
--   PA002  a sign-in address is kept: the retention period is unset, or the row is not yet older than it
--   PA003  a stored document version changes only by being withdrawn, once
-- Existing rows are not touched or checked: the triggers judge only what is written from now on.

CREATE FUNCTION "refuse_trail_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on "%" is refused: the table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'PA001', HINT = 'ADR 0034 D11. Rows here are evidence and are never changed or removed, by any database login.';
END
$$;

CREATE TRIGGER "AuditEntry_append_only" BEFORE UPDATE OR DELETE ON "AuditEntry" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "AuditEntry_no_truncate" BEFORE TRUNCATE ON "AuditEntry" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "AuditEntry" ENABLE ALWAYS TRIGGER "AuditEntry_append_only";
ALTER TABLE "AuditEntry" ENABLE ALWAYS TRIGGER "AuditEntry_no_truncate";

CREATE TRIGGER "SignInEvent_append_only" BEFORE UPDATE OR DELETE ON "SignInEvent" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "SignInEvent_no_truncate" BEFORE TRUNCATE ON "SignInEvent" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "SignInEvent" ENABLE ALWAYS TRIGGER "SignInEvent_append_only";
ALTER TABLE "SignInEvent" ENABLE ALWAYS TRIGGER "SignInEvent_no_truncate";

-- O-1: the address and user agent of a sign-in event. UPDATE is always refused. DELETE is allowed only once the event is
-- older than its organisation's SecurityPolicy.signInDetailRetentionDays, and is refused while that is unset or there is
-- no policy row at all. The row holds no time of its own, so the event's time and organisation are read through eventId.
CREATE FUNCTION "guard_sign_in_event_detail"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  happened  TIMESTAMP(3);
  keep_days INTEGER;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    RAISE EXCEPTION '% on "SignInEventDetail" is refused: a sign-in address is never changed', TG_OP
      USING ERRCODE = 'PA001', HINT = 'Ruling O-1. Expired rows are removed one by one by the operator purge, never by TRUNCATE.';
  END IF;
  SELECT e."at", p."signInDetailRetentionDays" INTO happened, keep_days
    FROM "SignInEvent" e LEFT JOIN "SecurityPolicy" p ON p."organisationId" = e."organisationId"
   WHERE e."id" = OLD."eventId";
  IF keep_days IS NULL THEN
    RAISE EXCEPTION 'DELETE on "SignInEventDetail" is refused: the retention period is not set, so sign-in addresses are kept'
      USING ERRCODE = 'PA002', HINT = 'Ruling O-1. Set SecurityPolicy.signInDetailRetentionDays first.';
  END IF;
  IF happened IS NULL OR happened > (now() AT TIME ZONE 'UTC') - make_interval(days => keep_days) THEN
    RAISE EXCEPTION 'DELETE on "SignInEventDetail" is refused: the sign-in is not yet older than the retention period of % days', keep_days
      USING ERRCODE = 'PA002', HINT = 'Ruling O-1.';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER "SignInEventDetail_guard" BEFORE UPDATE OR DELETE ON "SignInEventDetail" FOR EACH ROW EXECUTE FUNCTION "guard_sign_in_event_detail"();
CREATE TRIGGER "SignInEventDetail_no_truncate" BEFORE TRUNCATE ON "SignInEventDetail" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "SignInEventDetail" ENABLE ALWAYS TRIGGER "SignInEventDetail_guard";
ALTER TABLE "SignInEventDetail" ENABLE ALWAYS TRIGGER "SignInEventDetail_no_truncate";

-- OD-9: a stored version is never deleted, and changes only by being withdrawn once: withdrawnAt from null to set, with a
-- reason, and every other column exactly as it was (the withdrawal action, src/app/documents/actions.ts withdrawVersion).
CREATE FUNCTION "guard_document_version"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."withdrawnAt" IS NULL AND NEW."withdrawnAt" IS NOT NULL
       AND OLD."withdrawnReason" = '' AND btrim(NEW."withdrawnReason") <> ''
       AND (to_jsonb(NEW) - 'withdrawnAt' - 'withdrawnReason') = (to_jsonb(OLD) - 'withdrawnAt' - 'withdrawnReason') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% on "DocumentVersion" is refused: a stored version is never removed, and changes only by being withdrawn once, with a reason', TG_OP
    USING ERRCODE = 'PA003', HINT = 'OD-9. Upload a new version instead.';
END
$$;

CREATE TRIGGER "DocumentVersion_guard" BEFORE UPDATE OR DELETE ON "DocumentVersion" FOR EACH ROW EXECUTE FUNCTION "guard_document_version"();
CREATE TRIGGER "DocumentVersion_no_truncate" BEFORE TRUNCATE ON "DocumentVersion" FOR EACH STATEMENT EXECUTE FUNCTION "guard_document_version"();
ALTER TABLE "DocumentVersion" ENABLE ALWAYS TRIGGER "DocumentVersion_guard";
ALTER TABLE "DocumentVersion" ENABLE ALWAYS TRIGGER "DocumentVersion_no_truncate";
