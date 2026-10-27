-- CreateTable
CREATE TABLE "PaymentCorrection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "financePaymentId" TEXT,
    "supplyInvoicePaymentId" TEXT,
    "sequence" INTEGER NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "batchNo" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCorrection_financePaymentId_sequence_key" ON "PaymentCorrection"("financePaymentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCorrection_supplyInvoicePaymentId_sequence_key" ON "PaymentCorrection"("supplyInvoicePaymentId", "sequence");

-- AddForeignKey
ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_financePaymentId_fkey" FOREIGN KEY ("financePaymentId") REFERENCES "FinancePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_supplyInvoicePaymentId_fkey" FOREIGN KEY ("supplyInvoicePaymentId") REFERENCES "SupplyInvoicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 0.3 item 12 (hand-written): exactly one payment corrected, a reference and a reason, never a negative amount, a sequence from 1.
ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_one_payment" CHECK (num_nonnulls("financePaymentId", "supplyInvoicePaymentId") = 1);
ALTER TABLE "PaymentCorrection" ADD CONSTRAINT "PaymentCorrection_values" CHECK ((length(btrim("batchNo")) > 0 AND length(btrim("reason")) > 0 AND "amount" >= 0 AND "sequence" >= 1) IS TRUE);

-- PA052: a correction is filed under its payment's own organisation. Write-once: a plain change or removal is refused by the trail's own function (PA001).
CREATE FUNCTION public."payment_correction_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FinancePayment" p WHERE p."id" = NEW."financePaymentId" AND p."organisationId" = NEW."organisationId")
     AND NOT EXISTS (SELECT 1 FROM "SupplyInvoicePayment" p WHERE p."id" = NEW."supplyInvoicePaymentId" AND p."organisationId" = NEW."organisationId") THEN
    RAISE EXCEPTION 'INSERT on "PaymentCorrection" is refused: a correction is filed under the organisation of the payment it corrects'
      USING ERRCODE = 'PA052', HINT = 'Phase 0.3 item 12.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "PaymentCorrection_insert" BEFORE INSERT ON "PaymentCorrection" FOR EACH ROW EXECUTE FUNCTION public."payment_correction_insert"();
CREATE TRIGGER "PaymentCorrection_append_only" BEFORE UPDATE OR DELETE ON "PaymentCorrection" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "PaymentCorrection_no_truncate" BEFORE TRUNCATE ON "PaymentCorrection" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "PaymentCorrection" ENABLE ALWAYS TRIGGER "PaymentCorrection_insert";
ALTER TABLE "PaymentCorrection" ENABLE ALWAYS TRIGGER "PaymentCorrection_append_only";
ALTER TABLE "PaymentCorrection" ENABLE ALWAYS TRIGGER "PaymentCorrection_no_truncate";
