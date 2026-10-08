-- AlterTable
ALTER TABLE "OrganisationSignInPage" ADD COLUMN     "highlight1Icon" TEXT,
ADD COLUMN     "highlight2Icon" TEXT,
ADD COLUMN     "highlight3Icon" TEXT;

-- CreateTable
CREATE TABLE "OrganisationSignInDarkLogo" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationSignInDarkLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationSignInDarkLogo_organisationId_key" ON "OrganisationSignInDarkLogo"("organisationId");

-- CreateIndex
CREATE INDEX "OrganisationSignInDarkLogo_sha256_idx" ON "OrganisationSignInDarkLogo"("sha256");

-- AddForeignKey
ALTER TABLE "OrganisationSignInDarkLogo" ADD CONSTRAINT "OrganisationSignInDarkLogo_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
