-- Sourcing Requirements v2, wave 3c step 3: SR-14 (ruling 22, 20cp, build plan section 2). Migrations through 20261108000000 are applied, so nothing in them is edited.
--
-- An opened offer gains a column revision. Every checklist answer that changes, every decision recorded and every decision cleared on the offer raises it by one, in the
-- same transaction as the act (step 4 writes those acts). A confirmation (OpenedBidInitial) records the revision it was taken on, and counts only while the offer still
-- reads that revision. Both columns default to 0, so no row needs a backfill: every existing initial reads 0 on an offer that reads 0, and stands exactly as before.
--
-- One trigger keeps the revision forward only. An UPDATE that names the column must set it to exactly the old value plus one (SQLSTATE PA032). The trigger fires
-- on UPDATE OF the column, so setting it to its own value is refused as well, and an UPDATE that does not name it is untouched. It is ENABLE ALWAYS, so a replica
-- session does not skip it. Its search_path is pinned and its body schema-qualified. Neither table is append-only or sealed, so no grant changes.

-- AlterTable
ALTER TABLE "OpenedBid" ADD COLUMN     "columnRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OpenedBidInitial" ADD COLUMN     "columnRevision" INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public."opened_bid_column_revision_forward"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW."columnRevision" IS DISTINCT FROM OLD."columnRevision" + 1 THEN
    RAISE EXCEPTION 'UPDATE of "OpenedBid" % is refused: the column revision moves from % to %, and it only ever moves up by one', OLD."id", OLD."columnRevision", NEW."columnRevision"
      USING ERRCODE = 'PA032', HINT = 'SR-14, ruling 22. A confirmation counts only on the revision it was taken on, so the revision never goes back, stands still when written, or skips.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OpenedBid_column_revision_forward" BEFORE UPDATE OF "columnRevision" ON public."OpenedBid" FOR EACH ROW EXECUTE FUNCTION public."opened_bid_column_revision_forward"();
ALTER TABLE public."OpenedBid" ENABLE ALWAYS TRIGGER "OpenedBid_column_revision_forward";
