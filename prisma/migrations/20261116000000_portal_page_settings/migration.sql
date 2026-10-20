-- CreateTable
CREATE TABLE "OrganisationPortalPage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "publicAddress" TEXT,
    "headline" TEXT,
    "line" TEXT,
    "highlight1" TEXT,
    "highlight1Icon" TEXT,
    "highlight2" TEXT,
    "highlight2Icon" TEXT,
    "highlight3" TEXT,
    "highlight3Icon" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationPortalPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationPortalPage_organisationId_key" ON "OrganisationPortalPage"("organisationId");

-- AddForeignKey
ALTER TABLE "OrganisationPortalPage" ADD CONSTRAINT "OrganisationPortalPage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

