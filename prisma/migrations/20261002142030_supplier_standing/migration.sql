-- CreateEnum
CREATE TYPE "StandingEventKind" AS ENUM ('SUSPEND', 'REINSTATE', 'BLACKLIST', 'BLACKLIST_LIFT', 'REGISTRATION_CANCELLED');

-- CreateEnum
CREATE TYPE "StandingReasonUse" AS ENUM ('SUSPEND', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "StandingRequestKind" AS ENUM ('BLACKLIST', 'BLACKLIST_LIFT');

-- CreateEnum
CREATE TYPE "IneligibleBidConsequence" AS ENUM ('ELIMINATE', 'REPORT');

-- CreateEnum
CREATE TYPE "PermissionRelaxes" AS ENUM ('GRADE', 'FIELD_CODE');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "specialPermissionId" TEXT,
ADD COLUMN     "standingRequestId" TEXT;

-- AlterTable
ALTER TABLE "DocumentSale" ADD COLUMN     "eligibilitySnapshot" JSONB;

-- AlterTable
ALTER TABLE "ExerciseWindow" ADD COLUMN     "specialPermissionOffered" BOOLEAN;

-- AlterTable
ALTER TABLE "OpenedBid" ADD COLUMN     "eligibilityFinding" JSONB;

-- AlterTable
ALTER TABLE "SupplierPolicy" ADD COLUMN     "autoSuspendOnLapse" BOOLEAN,
ADD COLUMN     "bandsProvenance" "Provenance",
ADD COLUMN     "blacklistFirstOffenceMonths" INTEGER,
ADD COLUMN     "blacklistProvenance" "Provenance",
ADD COLUMN     "closingDayProvenance" "Provenance",
ADD COLUMN     "criticalDays" INTEGER,
ADD COLUMN     "expiryOnClosingDayCounts" BOOLEAN,
ADD COLUMN     "ineligibleBidConsequence" "IneligibleBidConsequence",
ADD COLUMN     "ineligibleProvenance" "Provenance",
ADD COLUMN     "lapseProvenance" "Provenance",
ADD COLUMN     "lapseReasonId" TEXT,
ADD COLUMN     "registerRequiredForSale" BOOLEAN,
ADD COLUMN     "restrictionEvidenceTypeId" TEXT,
ADD COLUMN     "restrictionProvenance" "Provenance",
ADD COLUMN     "saleProvenance" "Provenance",
ADD COLUMN     "upcomingDays" INTEGER,
ADD COLUMN     "warningDays" INTEGER;

-- CreateTable
CREATE TABLE "StandingReason" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT NOT NULL DEFAULT '',
    "appliesTo" "StandingReasonUse" NOT NULL,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "StandingRequestKind" NOT NULL,
    "reasonId" TEXT,
    "reasonSnapshot" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "sourceAwardId" TEXT,
    "liftsEventId" TEXT,
    "requestedByPersonId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "StandingEventKind" NOT NULL,
    "reasonId" TEXT,
    "reasonSnapshot" TEXT NOT NULL DEFAULT '',
    "effectiveOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "offenceNo" INTEGER,
    "periodMonths" INTEGER,
    "requestId" TEXT,
    "flaggedDocumentIds" TEXT[],
    "checklist" JSONB,
    "reinstatesEventId" TEXT,
    "liftsEventId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialPermission" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "requirementLabelSnapshot" TEXT NOT NULL,
    "relaxes" "PermissionRelaxes" NOT NULL,
    "grantingBodyIds" TEXT[],
    "grantingBodyLabels" TEXT[],
    "internalApproval" BOOLEAN NOT NULL,
    "existingClassConfirmed" BOOLEAN NOT NULL,
    "goodRecordConfirmed" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "requestedByPersonId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "grantedOn" TIMESTAMP(3),
    "grantedByPersonId" TEXT,
    "grantedAt" TIMESTAMP(3),

    CONSTRAINT "SpecialPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StandingReason_organisationId_code_key" ON "StandingReason"("organisationId", "code");

-- CreateIndex
CREATE INDEX "StandingRequest_supplierId_idx" ON "StandingRequest"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "StandingEvent_requestId_key" ON "StandingEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "StandingEvent_reinstatesEventId_key" ON "StandingEvent"("reinstatesEventId");

-- CreateIndex
CREATE UNIQUE INDEX "StandingEvent_liftsEventId_key" ON "StandingEvent"("liftsEventId");

-- CreateIndex
CREATE INDEX "StandingEvent_supplierId_idx" ON "StandingEvent"("supplierId");

-- CreateIndex
CREATE INDEX "SpecialPermission_exerciseId_idx" ON "SpecialPermission"("exerciseId");

-- CreateIndex
CREATE INDEX "SpecialPermission_partyId_idx" ON "SpecialPermission"("partyId");

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_standingRequestId_fkey" FOREIGN KEY ("standingRequestId") REFERENCES "StandingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_specialPermissionId_fkey" FOREIGN KEY ("specialPermissionId") REFERENCES "SpecialPermission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Condition (5): no vendorId is backfilled or matched. Any value already set aborts the migration here,
-- naming the row, before either foreign key is added (the cast fails only where such a row exists).
SELECT CAST('ExerciseParty ' || p."id" || ' has a vendorId: 6.15 condition 5 refuses the foreign key until it is null' AS integer) FROM "ExerciseParty" p WHERE p."vendorId" IS NOT NULL;

SELECT CAST('Award ' || a."id" || ' has a vendorId: 6.15 condition 5 refuses the foreign key until it is null' AS integer) FROM "Award" a WHERE a."vendorId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseParty" ADD CONSTRAINT "ExerciseParty_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_lapseReasonId_fkey" FOREIGN KEY ("lapseReasonId") REFERENCES "StandingReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_restrictionEvidenceTypeId_fkey" FOREIGN KEY ("restrictionEvidenceTypeId") REFERENCES "SupplierDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingReason" ADD CONSTRAINT "StandingReason_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "StandingReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_sourceAwardId_fkey" FOREIGN KEY ("sourceAwardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_liftsEventId_fkey" FOREIGN KEY ("liftsEventId") REFERENCES "StandingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_requestedByPersonId_fkey" FOREIGN KEY ("requestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "StandingReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StandingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_reinstatesEventId_fkey" FOREIGN KEY ("reinstatesEventId") REFERENCES "StandingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_liftsEventId_fkey" FOREIGN KEY ("liftsEventId") REFERENCES "StandingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ExerciseRegistrationRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_requestedByPersonId_fkey" FOREIGN KEY ("requestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_grantedByPersonId_fkey" FOREIGN KEY ("grantedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OD-2 A, OD-8 A, FR-ADV-017: a supplier matter's route names exactly one supplier record, and any other route names none.
ALTER TABLE "ApprovalInstance" DROP CONSTRAINT "ApprovalInstance_supplier_matter";
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_supplier_matter"
  CHECK (num_nonnulls("supplierApplicationId", "standingRequestId", "specialPermissionId") = CASE WHEN "matterKind" = 'SUPPLIER' THEN 1 ELSE 0 END);

-- FR-VND-010, FR-TRM-017: each kind of standing event carries what it needs and nothing else.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_shape"
  CHECK (("kind" = 'BLACKLIST') = ("offenceNo" IS NOT NULL)
    AND ("offenceNo" IS NULL OR "offenceNo" >= 1)
    AND ("endsOn" IS NULL OR "kind" = 'BLACKLIST')
    AND ("periodMonths" IS NULL OR ("kind" = 'BLACKLIST' AND "periodMonths" >= 1))
    AND (("kind" = 'REINSTATE') = ("reinstatesEventId" IS NOT NULL))
    AND (("kind" = 'BLACKLIST_LIFT') = ("liftsEventId" IS NOT NULL))
    AND (("kind" IN ('BLACKLIST', 'BLACKLIST_LIFT')) = ("requestId" IS NOT NULL))
    AND ("kind" NOT IN ('SUSPEND', 'BLACKLIST') OR "reasonId" IS NOT NULL));

-- OD-8 A: a blacklisting is asked for with a reason from the list, a lift names the blacklisting it ends.
ALTER TABLE "StandingRequest" ADD CONSTRAINT "StandingRequest_shape"
  CHECK (("kind" = 'BLACKLIST_LIFT') = ("liftsEventId" IS NOT NULL)
    AND ("kind" <> 'BLACKLIST' OR "reasonId" IS NOT NULL));

-- FR-VND-008, condition (4): bands are whole days in order, the period at least a month. Unset stays null.
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_bands"
  CHECK (("criticalDays" IS NULL OR "criticalDays" >= 0)
    AND ("warningDays" IS NULL OR "warningDays" >= 0)
    AND ("upcomingDays" IS NULL OR "upcomingDays" >= 0)
    AND ("criticalDays" IS NULL OR "warningDays" IS NULL OR "criticalDays" < "warningDays")
    AND ("warningDays" IS NULL OR "upcomingDays" IS NULL OR "warningDays" < "upcomingDays")
    AND ("criticalDays" IS NULL OR "upcomingDays" IS NULL OR "criticalDays" < "upcomingDays")
    AND ("blacklistFirstOffenceMonths" IS NULL OR "blacklistFirstOffenceMonths" >= 1));

-- FR-ADV-017: a grant names who granted it, with both confirmations, and some authority grants it.
ALTER TABLE "SpecialPermission" ADD CONSTRAINT "SpecialPermission_shape"
  CHECK ((("grantedOn" IS NULL) = ("grantedByPersonId" IS NULL))
    AND (("grantedOn" IS NULL) = ("grantedAt" IS NULL))
    AND ("grantedOn" IS NULL OR ("existingClassConfirmed" AND "goodRecordConfirmed"))
    AND ("internalApproval" OR cardinality("grantingBodyIds") > 0)
    AND cardinality("grantingBodyIds") = cardinality("grantingBodyLabels"));
