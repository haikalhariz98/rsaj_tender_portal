-- AlterTable
ALTER TABLE "AuthorityRole" ADD COLUMN     "authorityLevel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "workspace" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "department" TEXT,
ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portalRoleCode" TEXT,
ADD COLUMN     "telephone" TEXT;

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "groupLabel" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleCapability" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "grantedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "capabilityCodes" TEXT[],
    "valueCeiling" DECIMAL(18,2),
    "reason" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "noSubDelegation" BOOLEAN NOT NULL DEFAULT true,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Capability_organisationId_sortOrder_idx" ON "Capability"("organisationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Capability_organisationId_code_key" ON "Capability"("organisationId", "code");

-- CreateIndex
CREATE INDEX "RoleCapability_roleCode_idx" ON "RoleCapability"("roleCode");

-- CreateIndex
CREATE UNIQUE INDEX "RoleCapability_capabilityId_roleCode_key" ON "RoleCapability"("capabilityId", "roleCode");

-- CreateIndex
CREATE INDEX "Delegation_organisationId_effectiveFrom_idx" ON "Delegation"("organisationId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Delegation_fromPersonId_idx" ON "Delegation"("fromPersonId");

-- CreateIndex
CREATE INDEX "Delegation_toPersonId_idx" ON "Delegation"("toPersonId");

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleCapability" ADD CONSTRAINT "RoleCapability_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
