-- CreateTable
CREATE TABLE "OrganisationSignInImage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationSignInImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationSignInPage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "portalName" TEXT,
    "headline" TEXT,
    "supportingText" TEXT,
    "highlight1" TEXT,
    "highlight2" TEXT,
    "highlight3" TEXT,
    "tagline" TEXT,
    "privacyUrl" TEXT,
    "termsUrl" TEXT,
    "helpDeskUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationSignInPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationSignInImage_organisationId_key" ON "OrganisationSignInImage"("organisationId");

-- CreateIndex
CREATE INDEX "OrganisationSignInImage_sha256_idx" ON "OrganisationSignInImage"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationSignInPage_organisationId_key" ON "OrganisationSignInPage"("organisationId");

-- AddForeignKey
ALTER TABLE "OrganisationSignInImage" ADD CONSTRAINT "OrganisationSignInImage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationSignInPage" ADD CONSTRAINT "OrganisationSignInPage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
