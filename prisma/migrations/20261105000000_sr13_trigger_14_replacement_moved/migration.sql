-- Sourcing Requirements v2, wave 3b: SR-13 (ADR 0036 D7, build plan section 1.4 trigger 14, step 10). Migration 20261103200000 is applied, so nothing in it is edited: this adds one trigger.
--
-- A replace is one act. A submission that names another as the one it replaces must, by the commit, have moved that one to REPLACED in the same transaction.
-- Trigger 2 already refuses REPLACED without a replacement written in the same transaction. This is the converse. Without it a submission could name a live
-- alternative as replaced and leave it SUBMITTED (both would be opened, and the old one could never be replaced again, since the replaced reference is unique),
-- or name a bid that the same act withdrew. For a bid the one-standing-bid trigger already catches the form where both stay SUBMITTED. This one covers both
-- kinds and the withdrawn variant.
--
-- SQLSTATE PA028: a replacement whose replaced submission was not moved to REPLACED in its transaction.
-- The function pins its search_path and names its tables in the public schema. It reads no clock.

CREATE FUNCTION public."sealed_replacement_moved"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."OnlineBid" o WHERE o."id" = NEW."replacesOnlineBidId" AND o."status" = 'REPLACED' AND o."statusXact" = pg_current_xact_id()) THEN
    RAISE EXCEPTION 'A submission % that replaces % is refused at the commit: the replaced submission was not moved to REPLACED in the same transaction', NEW."id", NEW."replacesOnlineBidId"
      USING ERRCODE = 'PA028', HINT = 'ADR 0036 D7, build plan trigger 14. A replace is one act: the new submission is written, and the old one is moved to REPLACED in the same transaction.';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "OnlineBid_replacement_moved" AFTER INSERT ON "OnlineBid" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."replacesOnlineBidId" IS NOT NULL) EXECUTE FUNCTION public."sealed_replacement_moved"();
ALTER TABLE "OnlineBid" ENABLE ALWAYS TRIGGER "OnlineBid_replacement_moved";
