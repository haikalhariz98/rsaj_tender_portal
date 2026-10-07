-- Phase 3a (ADR 0034 D11, D14): the SULIT access log is evidence of who read what, and is refused every UPDATE and DELETE, by any
-- database login, the owner and a superuser included. The trigger is the one Phase 1d made for the trail ("refuse_trail_change",
-- SQLSTATE PA001), and the app's login gets no UPDATE, DELETE or TRUNCATE on the table either (scripts/db-roles.ts already names it).
-- TRUNCATE skips row triggers, so the table also gets a statement-level refusal. ENABLE ALWAYS keeps both firing when a session sets
-- session_replication_role to replica. The table is new and empty, so no existing row is judged.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   DROP TRIGGER "SulitAccessEvent_no_truncate" ON "SulitAccessEvent"
--   DROP TRIGGER "SulitAccessEvent_append_only" ON "SulitAccessEvent"

CREATE TRIGGER "SulitAccessEvent_append_only" BEFORE UPDATE OR DELETE ON "SulitAccessEvent" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "SulitAccessEvent_no_truncate" BEFORE TRUNCATE ON "SulitAccessEvent" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "SulitAccessEvent" ENABLE ALWAYS TRIGGER "SulitAccessEvent_append_only";
ALTER TABLE "SulitAccessEvent" ENABLE ALWAYS TRIGGER "SulitAccessEvent_no_truncate";
