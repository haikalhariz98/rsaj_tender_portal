-- Sourcing Requirements v2, wave 3a review (SEC-2, SEC-6, S8). Only new objects and triggers: nothing already applied is changed.
--
-- SEC-2: PortalRateCounter counts what a portal account does in one fixed window (the download route, the pay action). It is a throttle and not evidence, so it is upserted
-- and carries no foreign keys.
--
-- SEC-6: the database holds the shape of a purchase and a sale as the code does, so a mistake in code or a hand-written statement cannot undo it.
--   PA004  a DocumentPurchase moves only from AWAITING_PAYMENT to PAID, and the columns that say what was bought and by whom do not change
--   PA005  a DocumentSale keeps the channel it was paid by, its simulated reference and the purchase it came from
--   PA006  a PAID purchase has its sale by the end of the transaction (deferred, because the sale is written after the purchase moves and points at it)
-- The refusals fire for every database login and with session_replication_role set to replica (ENABLE ALWAYS), as for the trails. Existing rows are not checked.

-- CreateTable
CREATE TABLE "PortalRateCounter" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortalRateCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalRateCounter_windowStart_idx" ON "PortalRateCounter"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "PortalRateCounter_accountId_action_windowStart_key" ON "PortalRateCounter"("accountId", "action", "windowStart");

-- Hand-written: SEC-6. To undo, drop the triggers first, then the functions.
--   DROP TRIGGER "DocumentPurchase_guard" ON "DocumentPurchase"
--   DROP TRIGGER "DocumentPurchase_paid_has_sale" ON "DocumentPurchase"
--   DROP TRIGGER "DocumentSale_guard_purchase_link" ON "DocumentSale"
CREATE FUNCTION "guard_document_purchase_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" IS DISTINCT FROM 'AWAITING_PAYMENT' OR NEW."state" IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'UPDATE on "DocumentPurchase" is refused: a purchase moves only from AWAITING_PAYMENT to PAID, not from % to %', OLD."state", NEW."state"
      USING ERRCODE = 'PA004', HINT = 'SR-10 review SEC-6. A paid purchase is never changed, and a purchase is never put back.';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId" OR NEW."windowId" IS DISTINCT FROM OLD."windowId"
     OR NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR NEW."buyerAccountId" IS DISTINCT FROM OLD."buyerAccountId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."checks" IS DISTINCT FROM OLD."checks" THEN
    RAISE EXCEPTION 'UPDATE on "DocumentPurchase" is refused: what was bought, by whom and for how much does not change'
      USING ERRCODE = 'PA004', HINT = 'SR-10 review SEC-6.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "guard_document_sale_purchase_link"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."paymentChannel" IS DISTINCT FROM OLD."paymentChannel" OR NEW."simulatedReference" IS DISTINCT FROM OLD."simulatedReference" OR NEW."purchaseId" IS DISTINCT FROM OLD."purchaseId" THEN
    RAISE EXCEPTION 'UPDATE on "DocumentSale" is refused: how a sale was paid and the purchase it came from do not change'
      USING ERRCODE = 'PA005', HINT = 'SR-10 review SEC-6. A simulated sale never becomes a counter sale, nor the other way round.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "check_paid_purchase_has_sale"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" = 'PAID' AND NOT EXISTS (SELECT 1 FROM "DocumentSale" WHERE "purchaseId" = NEW."id") THEN
    RAISE EXCEPTION 'A purchase cannot be PAID without the sale it made: "DocumentPurchase" %', NEW."id"
      USING ERRCODE = 'PA006', HINT = 'SR-10 review S8. markPurchasePaid writes the sale in the same transaction.';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "DocumentPurchase_guard" BEFORE UPDATE ON "DocumentPurchase" FOR EACH ROW EXECUTE FUNCTION "guard_document_purchase_change"();
CREATE TRIGGER "DocumentSale_guard_purchase_link" BEFORE UPDATE ON "DocumentSale" FOR EACH ROW EXECUTE FUNCTION "guard_document_sale_purchase_link"();
CREATE CONSTRAINT TRIGGER "DocumentPurchase_paid_has_sale" AFTER INSERT OR UPDATE ON "DocumentPurchase" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_paid_purchase_has_sale"();
ALTER TABLE "DocumentPurchase" ENABLE ALWAYS TRIGGER "DocumentPurchase_guard";
ALTER TABLE "DocumentSale" ENABLE ALWAYS TRIGGER "DocumentSale_guard_purchase_link";
ALTER TABLE "DocumentPurchase" ENABLE ALWAYS TRIGGER "DocumentPurchase_paid_has_sale";
