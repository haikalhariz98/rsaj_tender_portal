-- CreateEnum
CREATE TYPE "VariationPctBasis" AS ENUM ('THIS_VARIATION', 'CUMULATIVE');

-- CreateEnum
CREATE TYPE "VariationBase" AS ENUM ('ORIGINAL', 'REVISED');

-- CreateEnum
CREATE TYPE "VariationScheduleForm" AS ENUM ('AGREED_PRICE', 'MEASURED', 'BOTH');

-- CreateEnum
CREATE TYPE "VariationOrigin" AS ENUM ('DEPARTMENT', 'SO_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "VariationExemption" AS ENUM ('REDUCTION', 'PC_SUM', 'PROVISIONAL_SUM', 'REMEASUREMENT');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SUPPORTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VariationEvent" AS ENUM ('PRIOR', 'INCREASE', 'AGREED_RATE', 'REMEASUREMENT');

-- CreateEnum
CREATE TYPE "VariationRateSource" AS ENUM ('CONTRACT_RATE', 'AGREED_RATE');

-- CreateEnum
CREATE TYPE "AdjustmentDirection" AS ENUM ('ADDITION', 'OMISSION');

-- CreateEnum
CREATE TYPE "AdjustmentSection" AS ENUM ('VARIATION', 'OTHER');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "variationId" TEXT;

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "variationId" TEXT;

-- AlterTable
ALTER TABLE "PostAwardPolicy" ADD COLUMN     "funderConsentCommitteeId" TEXT,
ADD COLUMN     "funderConsentProvenance" "Provenance",
ADD COLUMN     "scheduleFormAgreedRate" "VariationScheduleForm",
ADD COLUMN     "scheduleFormNoAgreedRate" "VariationScheduleForm",
ADD COLUMN     "scheduleFormProvenance" "Provenance",
ADD COLUMN     "variationBase" "VariationBase",
ADD COLUMN     "variationPctBasis" "VariationPctBasis",
ADD COLUMN     "variationProvenance" "Provenance";

-- CreateTable
CREATE TABLE "Variation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "reference" TEXT,
    "status" "VariationStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "VariationOrigin" NOT NULL,
    "originatorPersonId" TEXT NOT NULL,
    "originatorName" TEXT NOT NULL,
    "reviewedByPersonId" TEXT,
    "reviewedOn" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "allocationConfirmed" BOOLEAN,
    "allocationNote" TEXT NOT NULL DEFAULT '',
    "principalPersonId" TEXT,
    "principalOn" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "estimate" DECIMAL(18,2) NOT NULL,
    "exemption" "VariationExemption",
    "periodImplication" BOOLEAN,
    "funderConsentRequired" BOOLEAN,
    "agreedRateExists" BOOLEAN,
    "applicationCertificateId" TEXT,
    "submittedOn" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "applicationReading" JSONB,
    "soDecision" "SignatureDecision",
    "soDecisionCap" DECIMAL(18,2),
    "soDecidedByPersonId" TEXT,
    "soDecidedOn" TIMESTAMP(3),
    "soDecisionNote" TEXT NOT NULL DEFAULT '',
    "commencedOn" TIMESTAMP(3),
    "commencedSupportPersonId" TEXT,
    "commencedNote" TEXT NOT NULL DEFAULT '',
    "closedOn" TIMESTAMP(3),
    "closedReason" TEXT NOT NULL DEFAULT '',
    "closedByPersonId" TEXT,
    "recordedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationApproval" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "event" "VariationEvent" NOT NULL,
    "approvalInstanceId" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "reading" JSONB NOT NULL,
    "sentByPersonId" TEXT NOT NULL,
    "sentOn" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationInstruction" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduleForm" "VariationScheduleForm" NOT NULL,
    "oralIssuedOn" TIMESTAMP(3),
    "confirmDueOn" TIMESTAMP(3),
    "contractorConfirmedOn" TIMESTAMP(3),
    "confirmationMatches" BOOLEAN,
    "objectionDueOn" TIMESTAMP(3),
    "objectedOn" TIMESTAMP(3),
    "objectionNote" TEXT NOT NULL DEFAULT '',
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationMeasurement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "itemRef" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rateSource" "VariationRateSource" NOT NULL,
    "bqItemRef" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "baseRate" DECIMAL(18,2) NOT NULL,
    "adjustmentPct" DECIMAL(9,4),
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "measuredOn" TIMESTAMP(3) NOT NULL,
    "coveredUp" BOOLEAN NOT NULL,
    "recordsNote" TEXT NOT NULL DEFAULT '',
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "VariationMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayworkRecord" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "workedOn" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "agreedOn" TIMESTAMP(3),
    "agreedWith" TEXT NOT NULL DEFAULT '',
    "substantiationDueOn" TIMESTAMP(3),
    "substantiationReceivedOn" TIMESTAMP(3),
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayworkRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationCertificate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "valuationClauseId" TEXT,
    "valuationClauseTitle" TEXT NOT NULL,
    "judgedUnder" JSONB NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SumAdjustment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "judgedUnder" JSONB NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SumAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SumAdjustmentLine" (
    "id" TEXT NOT NULL,
    "sumAdjustmentId" TEXT NOT NULL,
    "section" "AdjustmentSection" NOT NULL,
    "trigger" "SumAdjustmentTrigger" NOT NULL,
    "variationCertificateId" TEXT,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "basis" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "SumAdjustmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Variation_applicationCertificateId_key" ON "Variation"("applicationCertificateId");

-- CreateIndex
CREATE INDEX "Variation_contractId_idx" ON "Variation"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Variation_organisationId_reference_key" ON "Variation"("organisationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "VariationApproval_approvalInstanceId_key" ON "VariationApproval"("approvalInstanceId");

-- CreateIndex
CREATE INDEX "VariationApproval_variationId_idx" ON "VariationApproval"("variationId");

-- CreateIndex
CREATE UNIQUE INDEX "VariationInstruction_certificateId_key" ON "VariationInstruction"("certificateId");

-- CreateIndex
CREATE INDEX "VariationInstruction_variationId_idx" ON "VariationInstruction"("variationId");

-- CreateIndex
CREATE INDEX "VariationMeasurement_instructionId_idx" ON "VariationMeasurement"("instructionId");

-- CreateIndex
CREATE INDEX "DayworkRecord_variationId_idx" ON "DayworkRecord"("variationId");

-- CreateIndex
CREATE UNIQUE INDEX "VariationCertificate_certificateId_key" ON "VariationCertificate"("certificateId");

-- CreateIndex
CREATE INDEX "VariationCertificate_variationId_idx" ON "VariationCertificate"("variationId");

-- CreateIndex
CREATE UNIQUE INDEX "SumAdjustment_certificateId_key" ON "SumAdjustment"("certificateId");

-- CreateIndex
CREATE INDEX "SumAdjustment_contractId_idx" ON "SumAdjustment"("contractId");

-- CreateIndex
CREATE INDEX "SumAdjustmentLine_sumAdjustmentId_idx" ON "SumAdjustmentLine"("sumAdjustmentId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_variationId_idx" ON "ApprovalInstance"("variationId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_funderConsentCommitteeId_fkey" FOREIGN KEY ("funderConsentCommitteeId") REFERENCES "Committee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_originatorPersonId_fkey" FOREIGN KEY ("originatorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_reviewedByPersonId_fkey" FOREIGN KEY ("reviewedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_principalPersonId_fkey" FOREIGN KEY ("principalPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_applicationCertificateId_fkey" FOREIGN KEY ("applicationCertificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_soDecidedByPersonId_fkey" FOREIGN KEY ("soDecidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_commencedSupportPersonId_fkey" FOREIGN KEY ("commencedSupportPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_closedByPersonId_fkey" FOREIGN KEY ("closedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationApproval" ADD CONSTRAINT "VariationApproval_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationApproval" ADD CONSTRAINT "VariationApproval_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationApproval" ADD CONSTRAINT "VariationApproval_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationApproval" ADD CONSTRAINT "VariationApproval_sentByPersonId_fkey" FOREIGN KEY ("sentByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationInstruction" ADD CONSTRAINT "VariationInstruction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationInstruction" ADD CONSTRAINT "VariationInstruction_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationInstruction" ADD CONSTRAINT "VariationInstruction_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationInstruction" ADD CONSTRAINT "VariationInstruction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationMeasurement" ADD CONSTRAINT "VariationMeasurement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationMeasurement" ADD CONSTRAINT "VariationMeasurement_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationMeasurement" ADD CONSTRAINT "VariationMeasurement_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "VariationInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationMeasurement" ADD CONSTRAINT "VariationMeasurement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkRecord" ADD CONSTRAINT "DayworkRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkRecord" ADD CONSTRAINT "DayworkRecord_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkRecord" ADD CONSTRAINT "DayworkRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationCertificate" ADD CONSTRAINT "VariationCertificate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationCertificate" ADD CONSTRAINT "VariationCertificate_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationCertificate" ADD CONSTRAINT "VariationCertificate_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "VariationInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationCertificate" ADD CONSTRAINT "VariationCertificate_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationCertificate" ADD CONSTRAINT "VariationCertificate_valuationClauseId_fkey" FOREIGN KEY ("valuationClauseId") REFERENCES "ClauseText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationCertificate" ADD CONSTRAINT "VariationCertificate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SumAdjustment" ADD CONSTRAINT "SumAdjustment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SumAdjustment" ADD CONSTRAINT "SumAdjustment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SumAdjustment" ADD CONSTRAINT "SumAdjustment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SumAdjustment" ADD CONSTRAINT "SumAdjustment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SumAdjustmentLine" ADD CONSTRAINT "SumAdjustmentLine_sumAdjustmentId_fkey" FOREIGN KEY ("sumAdjustmentId") REFERENCES "SumAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SumAdjustmentLine" ADD CONSTRAINT "SumAdjustmentLine_variationCertificateId_fkey" FOREIGN KEY ("variationCertificateId") REFERENCES "VariationCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6.13 Part A step 4 (by hand). A variation's route names its variation, and no other route does.
-- Pre-check, before the CHECK below: fails with the message as the error if a route is already a VARIATION matter (none was, the kind was unused). Nothing is changed then.
SELECT CAST((SELECT 'Pre-check failed: an approval route is already a VARIATION matter, so ApprovalInstance_variation_matter cannot be added. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ApprovalInstance" WHERE "matterKind" = 'VARIATION')) AS INTEGER);

ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_variation_matter" CHECK (("matterKind" = 'VARIATION') = ("variationId" IS NOT NULL));

-- A committee matter names a variation only where it is a VARIATION matter.
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_variation_matter" CHECK ("variationId" IS NULL OR "matterKind" = 'VARIATION');

-- FR-VAR-001, 004, 005, 014: the department path alone is reviewed, a reduction is below nothing and only a reduction is, a cap only on support and above nothing, a decision with who and when, commencement with its support, a closure with its day.
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_shape" CHECK (
  ("reviewedByPersonId" IS NULL OR "origin" = 'DEPARTMENT')
  AND ("estimate" <> 0)
  AND ("exemption" IS NOT NULL OR "estimate" > 0)
  AND (("exemption" = 'REDUCTION') = ("estimate" < 0))
  AND ("soDecisionCap" IS NULL OR ("soDecision" = 'SUPPORTED' AND "soDecisionCap" > 0))
  AND (("soDecision" IS NULL) = ("soDecidedByPersonId" IS NULL))
  AND (("soDecision" IS NULL) = ("soDecidedOn" IS NULL))
  AND (("commencedOn" IS NULL) = ("commencedSupportPersonId" IS NULL))
  AND (("status" = 'CLOSED') = ("closedOn" IS NOT NULL))
);

ALTER TABLE "VariationApproval" ADD CONSTRAINT "VariationApproval_value" CHECK ("value" >= 0);

-- FR-VAR-017, 018: a measured item has a quantity and a rate, its amount worked out, and is removed only with a reason.
ALTER TABLE "VariationMeasurement" ADD CONSTRAINT "VariationMeasurement_shape" CHECK ("quantity" > 0 AND "baseRate" >= 0 AND "amount" >= 0 AND ("removedAt" IS NULL OR "removedReason" <> '') AND ("rateSource" <> 'CONTRACT_RATE' OR "bqItemRef" <> ''));

-- FR-VAR-017: one item, never merged: an item reference once under an instruction while it stands.
CREATE UNIQUE INDEX "VariationMeasurement_one_item" ON "VariationMeasurement"("instructionId", "itemRef") WHERE "removedAt" IS NULL;

-- FR-VAR-019: an agreement names who it was agreed with.
ALTER TABLE "DayworkRecord" ADD CONSTRAINT "DayworkRecord_agreed" CHECK ("agreedOn" IS NULL OR "agreedWith" <> '');

-- FR-PAD-002: a 1.1 line is a variation's certificate under the variation trigger, a 1.2 line another trigger with its basis, every amount above nothing.
ALTER TABLE "SumAdjustmentLine" ADD CONSTRAINT "SumAdjustmentLine_shape" CHECK (
  "amount" > 0
  AND (("section" = 'VARIATION') = ("variationCertificateId" IS NOT NULL))
  AND (("section" = 'VARIATION') = ("trigger" = 'VARIATION'))
  AND ("section" = 'VARIATION' OR "basis" <> '')
);
