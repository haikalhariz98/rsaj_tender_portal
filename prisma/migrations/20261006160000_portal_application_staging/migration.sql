-- A public application is staged here, not made a supplier. It holds no registration number's place on the register and spends no supplier reference.
-- The policy gains the applicant notice and the two limits that keep the public form closed until the customer sets them.
-- CreateEnum
CREATE TYPE "PortalApplicationStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "SupplierPolicy" ADD COLUMN     "personalDataNoticeEn" TEXT,
ADD COLUMN     "personalDataNoticeMs" TEXT,
ADD COLUMN     "personalDataProvenance" "Provenance",
ADD COLUMN     "portalDailyLimit" INTEGER,
ADD COLUMN     "portalDailyLimitPerNumber" INTEGER,
ADD COLUMN     "portalLimitProvenance" "Provenance";

-- CreateTable
CREATE TABLE "PortalApplication" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PortalApplicationStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "registeredName" TEXT NOT NULL DEFAULT '',
    "registrationNo" TEXT NOT NULL DEFAULT '',
    "registrationNoKey" TEXT NOT NULL DEFAULT '',
    "entityTypeCode" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "registeredAddress" TEXT NOT NULL DEFAULT '',
    "companyEmail" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactDesignation" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "erasedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByPersonId" TEXT,
    "discardReason" TEXT NOT NULL DEFAULT '',
    "acceptedSupplierId" TEXT,

    CONSTRAINT "PortalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalApplication_organisationId_status_receivedAt_idx" ON "PortalApplication"("organisationId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "PortalApplication_organisationId_registrationNoKey_idx" ON "PortalApplication"("organisationId", "registrationNoKey");

-- CreateIndex
CREATE UNIQUE INDEX "PortalApplication_organisationId_reference_key" ON "PortalApplication"("organisationId", "reference");

-- AddForeignKey
ALTER TABLE "PortalApplication" ADD CONSTRAINT "PortalApplication_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplication" ADD CONSTRAINT "PortalApplication_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplication" ADD CONSTRAINT "PortalApplication_acceptedSupplierId_fkey" FOREIGN KEY ("acceptedSupplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

