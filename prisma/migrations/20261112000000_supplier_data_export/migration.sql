-- N2 (PDPA right of access, ruling 1875(8)), plan docs/notes/plans/backlog-n2.md section 3 and step 2: a supplier's export of its own data.
-- Additive. One row per export (the JSON file or the printable page), written with its audit row in the transaction that read the data. It holds
-- the section counts and the file's digest, never an exported value. AuditExport (FR-APR-015) is the precedent. No backfill: no export was made before.
--
-- To undo (nothing references the table)
--   DROP TABLE "SupplierDataExport"
--   DROP TYPE "SupplierExportForm"

-- CreateEnum
CREATE TYPE "SupplierExportForm" AS ENUM ('FILE', 'PAGE');

-- CreateTable
CREATE TABLE "SupplierDataExport" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "form" "SupplierExportForm" NOT NULL,
    "sectionCounts" JSONB NOT NULL,
    "sha256" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDataExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierDataExport_organisationId_supplierId_generatedAt_idx" ON "SupplierDataExport"("organisationId", "supplierId", "generatedAt");

-- AddForeignKey
ALTER TABLE "SupplierDataExport" ADD CONSTRAINT "SupplierDataExport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDataExport" ADD CONSTRAINT "SupplierDataExport_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDataExport" ADD CONSTRAINT "SupplierDataExport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

