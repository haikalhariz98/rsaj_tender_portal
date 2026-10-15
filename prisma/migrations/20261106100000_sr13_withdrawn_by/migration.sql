-- Sourcing Requirements v2, wave 3b: SR-13 (ADR 0036 D7, ruling 20ak). Migrations through 20261106000000 are applied, so nothing in them is edited.
--
-- A withdrawal is a signed act and names who made it. OnlineBid gains the supplier account that withdrew, nullable, on the pattern of the account that submitted. It is set only from the
-- stepped-up session by the app, never from a body. A row that moves to WITHDRAWN must name it, in the same transaction that moves it, and an account of the same supplier and organisation
-- (SQLSTATE PA031). Each alternative withdrawn in the same act carries the same account. A trigger on the move, not a CHECK on the column, so no row needs a backfill
-- (the founder's database holds no online bid). A CHECK only keeps the column empty on a row that is not withdrawn.
--
-- The change trigger below is the whole of the earlier function with two edits: the new column may change, and only with the move to WITHDRAWN. Its search_path stays pinned
-- and its tables schema-qualified.

ALTER TABLE "OnlineBid" ADD COLUMN "withdrawnBySupplierAccountId" TEXT;

ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_withdrawnBySupplierAccountId_fkey" FOREIGN KEY ("withdrawnBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_withdrawn_by_only_when_withdrawn" CHECK ("withdrawnBySupplierAccountId" IS NULL OR "status" = 'WITHDRAWN');

CREATE OR REPLACE FUNCTION public."sealed_online_bid_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  closing timestamp;
  replacement_stamp timestamp;
  old_parent_status text;
  old_parent_moved_here boolean;
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'statusAt', 'parentOnlineBidId', 'statusXact', 'withdrawnBySupplierAccountId']) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: a submission''s ciphertext, digests, keys and identity never change', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D12, S8. Ciphertext is immutable.';
  END IF;
  -- The transaction that moved the status, kept by this trigger whatever the writer sent.
  NEW."statusXact" := CASE WHEN NEW."status" IS DISTINCT FROM OLD."status" THEN pg_current_xact_id() ELSE OLD."statusXact" END;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'UPDATE of "OnlineBid" % from % to % is refused: a status moves forward only', OLD."id", OLD."status", NEW."status"
        USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, S12. A replaced, withdrawn or opened submission never moves again.';
    END IF;
    SELECT e."closingAt" INTO closing FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
    IF NEW."status" = 'REPLACED' THEN
      -- Judged by the replacement's own stamp: the replacement and its envelope inserted in this transaction, in time.
      SELECT ne."receivedAt" INTO replacement_stamp
        FROM public."OnlineBid" r JOIN public."BidEnvelope" ne ON ne."id" = r."envelopeId"
        WHERE r."replacesOnlineBidId" = OLD."id" AND r."kind" = OLD."kind" AND r."insertedXact" = pg_current_xact_id() AND ne."insertedXact" = pg_current_xact_id()
          AND NOT ne."late" AND ne."receivedAt" <= closing;
      IF replacement_stamp IS NULL OR NEW."statusAt" IS DISTINCT FROM replacement_stamp THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to REPLACED is refused: no in-time replacement was submitted in this transaction, or the stamp is not the replacement''s', OLD."id"
          USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, FR-BID-002. A replace is allowed up to and including the closing second, judged by the replacement''s stamp.';
      END IF;
    ELSIF NEW."status" = 'WITHDRAWN' THEN
      -- Ruling 20ak: a withdrawal is a signed act and names the supplier account that withdrew, one of the same supplier's, set in the transaction that moves the status.
      IF NEW."withdrawnBySupplierAccountId" IS NULL OR NOT EXISTS (SELECT 1 FROM public."SupplierAccount" a WHERE a."id" = NEW."withdrawnBySupplierAccountId" AND a."supplierId" = NEW."supplierId" AND a."organisationId" = NEW."organisationId") THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to WITHDRAWN is refused: it names no supplier account of the same supplier as the one that withdrew', OLD."id"
          USING ERRCODE = 'PA031', HINT = 'ADR 0036 D7, ruling 20ak. A withdrawal is a signed act and names who made it.';
      END IF;
      IF NEW."statusAt" IS NULL OR NEW."statusAt" <> date_trunc('second', NEW."statusAt") OR NEW."statusAt" > clock OR NEW."statusAt" < clock - make_interval(secs => 30) OR closing IS NULL OR NEW."statusAt" > closing THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to WITHDRAWN is refused: the withdrawal''s stamp % is not a whole second within 30 seconds before the database clock, at or before the closing', OLD."id", NEW."statusAt"
          USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, FR-BID-004, ruling 20aa. A withdrawal is allowed up to and including the closing second, judged by its own stamp.';
      END IF;
    ELSIF NEW."status" = 'OPENED' THEN
      IF NOT EXISTS (SELECT 1 FROM public."Opening" o WHERE o."exerciseId" = NEW."exerciseId" AND o."unsealedAt" IS NOT NULL AND o."finalisedAt" IS NULL AND o."unsealedXact" = pg_current_xact_id()) THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to OPENED is refused: no unseal of this exercise''s opening is being written in this transaction', OLD."id"
          USING ERRCODE = 'PA022', HINT = 'ADR 0036 D10, security audit 2. Only the last authorisation of the unseal opens a submission.';
      END IF;
    END IF;
  ELSIF NEW."withdrawnBySupplierAccountId" IS DISTINCT FROM OLD."withdrawnBySupplierAccountId" THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: the account that withdrew is set only with the move to WITHDRAWN', OLD."id"
      USING ERRCODE = 'PA031', HINT = 'ADR 0036 D7, ruling 20ak.';
  ELSIF NEW."statusAt" IS DISTINCT FROM OLD."statusAt" THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: a status stamp changes only with its status', OLD."id"
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7.';
  END IF;

  -- Trigger 6 (20h, M2): the parent moves only in the transaction that moved the old parent's status, to its replacement or to none.
  IF NEW."parentOnlineBidId" IS DISTINCT FROM OLD."parentOnlineBidId" THEN
    SELECT p."status"::text, (p."statusXact" = pg_current_xact_id()) INTO old_parent_status, old_parent_moved_here FROM public."OnlineBid" p WHERE p."id" = OLD."parentOnlineBidId";
    IF OLD."parentOnlineBidId" IS NULL
       OR old_parent_moved_here IS NOT TRUE
       OR NOT ((NEW."parentOnlineBidId" IS NULL AND old_parent_status = 'WITHDRAWN')
            OR (old_parent_status = 'REPLACED' AND EXISTS (SELECT 1 FROM public."OnlineBid" r WHERE r."id" = NEW."parentOnlineBidId" AND r."replacesOnlineBidId" = OLD."parentOnlineBidId"))) THEN
      RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: an alternative''s parent moves only to its parent''s replacement, or to none on its parent''s withdrawal, in that act', OLD."id"
        USING ERRCODE = 'PA016', HINT = 'ADR 0036 D7, ruling 20h, M2. No link ever points at a replaced or withdrawn bid, and none is added after submission.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
