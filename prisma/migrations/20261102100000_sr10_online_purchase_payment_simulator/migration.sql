-- Sourcing Requirements v2, wave 3a: SR-10 (ruling 17, as amended by the founder on 2026-10-09). The online purchase of the tender documents and the demonstration payment simulator.
--
-- A supplier's purchase (DocumentPurchase) starts "awaiting payment" and is paid in exactly two ways: the payment simulator's settlement (channel SIMULATED, with a simulated
-- reference and the method chosen) or an officer recording the finance receipt (channel FINANCE_RECEIPT). A paid purchase makes the sale (DocumentSale.purchaseId) that every reader of
-- a sale already reads. A simulated sale is never a finance receipt: the CHECKs below refuse a receipt number on it, and refuse a sale with no issuing officer unless it is simulated.
-- Every attempt at paying (PaymentAttempt) and every download of a released file (PurchaseDownload) is a row nobody can change: triggers refuse UPDATE, DELETE and TRUNCATE, as for
-- the other trails. The new tables are empty, and the existing sales are all counter sales (the default) and satisfy the CHECKs.

-- CreateEnum
CREATE TYPE "PurchaseState" AS ENUM ('AWAITING_PAYMENT', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('SIMULATED', 'FINANCE_RECEIPT');

-- CreateEnum
CREATE TYPE "SalePaymentChannel" AS ENUM ('COUNTER', 'SIMULATED');

-- CreateEnum
CREATE TYPE "PaymentOutcome" AS ENUM ('PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseDownloadKind" AS ENUM ('FILE', 'MERGED_TEXT');

-- AlterTable
ALTER TABLE "DocumentSale" ADD COLUMN     "paymentChannel" "SalePaymentChannel" NOT NULL DEFAULT 'COUNTER',
ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "simulatedReference" TEXT,
ALTER COLUMN "issuedByPersonId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DocumentPurchase" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "buyerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "checks" JSONB NOT NULL,
    "state" "PurchaseState" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "paidAt" TIMESTAMP(3),
    "paidChannel" "PaymentChannel",
    "paidMethod" TEXT,
    "paidReference" TEXT,
    "receiptRecordedByPersonId" TEXT,

    CONSTRAINT "DocumentPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "outcome" "PaymentOutcome" NOT NULL,
    "reference" TEXT NOT NULL,
    "failureText" TEXT NOT NULL DEFAULT '',
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "byAccountId" TEXT NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDownload" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "accountId" TEXT NOT NULL,
    "kind" "PurchaseDownloadKind" NOT NULL,
    "packVersion" INTEGER NOT NULL,
    "partLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentVersionId" TEXT,
    "downloadedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPurchase_supplierId_idx" ON "DocumentPurchase"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPurchase_windowId_supplierId_key" ON "DocumentPurchase"("windowId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_purchaseId_attemptNo_key" ON "PaymentAttempt"("purchaseId", "attemptNo");

-- CreateIndex
CREATE INDEX "PurchaseDownload_windowId_downloadedAt_idx" ON "PurchaseDownload"("windowId", "downloadedAt");

-- CreateIndex
CREATE INDEX "PurchaseDownload_supplierId_idx" ON "PurchaseDownload"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSale_purchaseId_key" ON "DocumentSale"("purchaseId");

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_buyerAccountId_fkey" FOREIGN KEY ("buyerAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_receiptRecordedByPersonId_fkey" FOREIGN KEY ("receiptRecordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_byAccountId_fkey" FOREIGN KEY ("byAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDownload" ADD CONSTRAINT "PurchaseDownload_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDownload" ADD CONSTRAINT "PurchaseDownload_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDownload" ADD CONSTRAINT "PurchaseDownload_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDownload" ADD CONSTRAINT "PurchaseDownload_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDownload" ADD CONSTRAINT "PurchaseDownload_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: the states, in the database as well as in the code.
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_paid_pair" CHECK (("state" = 'PAID') = ("paidAt" IS NOT NULL AND "paidChannel" IS NOT NULL));
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_simulated_fields" CHECK ("paidChannel" IS DISTINCT FROM 'SIMULATED' OR ("paidReference" IS NOT NULL AND "paidMethod" IS NOT NULL AND "receiptRecordedByPersonId" IS NULL));
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_receipt_fields" CHECK ("paidChannel" IS DISTINCT FROM 'FINANCE_RECEIPT' OR ("receiptRecordedByPersonId" IS NOT NULL AND "paidReference" IS NULL));
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_amount_not_negative" CHECK ("amount" >= 0);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_attempt_positive" CHECK ("attemptNo" > 0);
ALTER TABLE "PurchaseDownload" ADD CONSTRAINT "PurchaseDownload_pack_version_positive" CHECK ("packVersion" > 0);

-- Hand-written: a simulated sale is never a finance receipt, and has no issuing officer, and any other sale has one.
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_simulated_pair" CHECK (("paymentChannel" = 'SIMULATED') = ("simulatedReference" IS NOT NULL));
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_simulated_not_a_receipt" CHECK ("paymentChannel" <> 'SIMULATED' OR ("financeReceiptNo" IS NULL AND "receiptRecordedOn" IS NULL AND "purchaseId" IS NOT NULL AND "issuedByPersonId" IS NULL));
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_issuer_unless_simulated" CHECK ("issuedByPersonId" IS NOT NULL OR "paymentChannel" = 'SIMULATED');

-- Hand-written: the two trails nobody changes. To undo, drop the triggers first.
--   DROP TRIGGER "PaymentAttempt_append_only" ON "PaymentAttempt"
--   DROP TRIGGER "PaymentAttempt_no_truncate" ON "PaymentAttempt"
--   DROP TRIGGER "PurchaseDownload_append_only" ON "PurchaseDownload"
--   DROP TRIGGER "PurchaseDownload_no_truncate" ON "PurchaseDownload"
CREATE TRIGGER "PaymentAttempt_append_only" BEFORE UPDATE OR DELETE ON "PaymentAttempt" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "PaymentAttempt_no_truncate" BEFORE TRUNCATE ON "PaymentAttempt" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "PaymentAttempt" ENABLE ALWAYS TRIGGER "PaymentAttempt_append_only";
ALTER TABLE "PaymentAttempt" ENABLE ALWAYS TRIGGER "PaymentAttempt_no_truncate";
CREATE TRIGGER "PurchaseDownload_append_only" BEFORE UPDATE OR DELETE ON "PurchaseDownload" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "PurchaseDownload_no_truncate" BEFORE TRUNCATE ON "PurchaseDownload" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "PurchaseDownload" ENABLE ALWAYS TRIGGER "PurchaseDownload_append_only";
ALTER TABLE "PurchaseDownload" ENABLE ALWAYS TRIGGER "PurchaseDownload_no_truncate";
