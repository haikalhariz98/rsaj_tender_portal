-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "registrationNo" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "sstRegistrationNo" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "taxIdentificationNo" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "OrganisationLogo" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationLogo_organisationId_key" ON "OrganisationLogo"("organisationId");

-- CreateIndex
CREATE INDEX "OrganisationLogo_sha256_idx" ON "OrganisationLogo"("sha256");

-- AddForeignKey
ALTER TABLE "OrganisationLogo" ADD CONSTRAINT "OrganisationLogo_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
