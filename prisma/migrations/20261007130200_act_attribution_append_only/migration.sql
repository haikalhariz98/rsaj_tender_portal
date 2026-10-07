-- Phase 2a (ADR 0034 D12, "attributions are never deleted"): an attribution is evidence of who did an act, and is refused every UPDATE and
-- DELETE, by any database login, the owner and a superuser included. The trigger is the one Phase 1d made for the trail
-- ("refuse_trail_change", SQLSTATE PA001), and the app's login gets no UPDATE, DELETE or TRUNCATE on the table either (scripts/db-roles.ts).
-- TRUNCATE skips row triggers, so the table also gets a statement-level refusal. ENABLE ALWAYS keeps both firing when a session sets
-- session_replication_role to replica. The table is new and empty, so no existing row is judged.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   DROP TRIGGER "ActAttribution_no_truncate" ON "ActAttribution"
--   DROP TRIGGER "ActAttribution_append_only" ON "ActAttribution"

CREATE TRIGGER "ActAttribution_append_only" BEFORE UPDATE OR DELETE ON "ActAttribution" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "ActAttribution_no_truncate" BEFORE TRUNCATE ON "ActAttribution" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "ActAttribution" ENABLE ALWAYS TRIGGER "ActAttribution_append_only";
ALTER TABLE "ActAttribution" ENABLE ALWAYS TRIGGER "ActAttribution_no_truncate";
