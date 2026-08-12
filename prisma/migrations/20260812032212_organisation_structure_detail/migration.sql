-- AlterTable
ALTER TABLE "CostCentre" ADD COLUMN     "activity" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "orgUnitCode" TEXT,
ADD COLUMN     "ownerPersonId" TEXT,
ADD COLUMN     "siteCode" TEXT;

-- AlterTable
ALTER TABLE "OrgUnit" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "financialYearStart" TEXT,
ADD COLUMN     "headPersonId" TEXT,
ADD COLUMN     "operatingLicence" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "taxReference" TEXT,
ADD COLUMN     "telephone" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "district" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "town" TEXT NOT NULL DEFAULT '';

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_headPersonId_fkey" FOREIGN KEY ("headPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCentre" ADD CONSTRAINT "CostCentre_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
