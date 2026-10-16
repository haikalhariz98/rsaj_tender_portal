-- Sourcing Requirements v2, wave 3c review fix: the database holds the rest of SR-14's revision rule (ruling 22). Migrations through 20261108100000 are applied, so nothing in them is edited.
--
-- 20261108100000 made the column revision move forward by exactly one when an UPDATE names it. Two gaps stayed in the application alone, and a person or a later code path holding the application role
-- could use either to make a confirmation count on a decision its officer never read:
--   1. A decision (the verdict or its reason) could be changed by an UPDATE that does not name the revision, so no confirmation went stale.
--   2. A confirmation (OpenedBidInitial) could be written with, or set to, any revision, so a stale one could be made to stand with no act of its officer.
--
-- Trigger 1, on OpenedBid: when an UPDATE changes the verdict or its reason, the same UPDATE must raise the revision by exactly one (SQLSTATE PA033). An UPDATE that names the verdict but leaves it
-- unchanged is untouched, as is any UPDATE that does not change the decision.
-- Trigger 2, on OpenedBidInitial: a confirmation is written at the offer's current revision, and a later UPDATE that sets its revision sets it to the offer's current one again (SQLSTATE PA034).
-- The application renews a confirmation in exactly that way, in the transaction that holds the offer's row lock. Both functions pin search_path and schema-qualify every name. Both triggers are
-- ENABLE ALWAYS, so a replica session does not skip them. Neither table is append-only or sealed, so no grant changes.

CREATE OR REPLACE FUNCTION public."opened_bid_decision_moves_revision"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW."verdict" IS DISTINCT FROM OLD."verdict" OR NEW."verdictReason" IS DISTINCT FROM OLD."verdictReason") AND NEW."columnRevision" IS DISTINCT FROM OLD."columnRevision" + 1 THEN
    RAISE EXCEPTION 'UPDATE of "OpenedBid" % is refused: its decision changed but its column revision moved from % to %, and a changed decision raises it by exactly one', OLD."id", OLD."columnRevision", NEW."columnRevision"
      USING ERRCODE = 'PA033', HINT = 'SR-14, ruling 22. A confirmation counts only on the revision it was taken on, so a decision that changes must move the revision in the same write.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OpenedBid_decision_moves_revision" BEFORE UPDATE OF "verdict", "verdictReason" ON public."OpenedBid" FOR EACH ROW EXECUTE FUNCTION public."opened_bid_decision_moves_revision"();
ALTER TABLE public."OpenedBid" ENABLE ALWAYS TRIGGER "OpenedBid_decision_moves_revision";

CREATE OR REPLACE FUNCTION public."opened_bid_initial_at_current_revision"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_revision integer;
BEGIN
  SELECT b."columnRevision" INTO current_revision FROM public."OpenedBid" b WHERE b."id" = NEW."openedBidId";
  IF current_revision IS NULL OR NEW."columnRevision" IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'write of "OpenedBidInitial" % is refused: it names column revision %, and the offer reads %', NEW."id", NEW."columnRevision", current_revision
      USING ERRCODE = 'PA034', HINT = 'SR-14, ruling 22. A confirmation is taken on the revision the offer reads when it is written, and is only renewed to the revision it then reads.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OpenedBidInitial_at_current_revision" BEFORE INSERT OR UPDATE OF "columnRevision", "openedBidId" ON public."OpenedBidInitial" FOR EACH ROW EXECUTE FUNCTION public."opened_bid_initial_at_current_revision"();
ALTER TABLE public."OpenedBidInitial" ENABLE ALWAYS TRIGGER "OpenedBidInitial_at_current_revision";
