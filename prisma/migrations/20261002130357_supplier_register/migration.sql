-- CreateEnum
CREATE TYPE "RegistrationValueKind" AS ENUM ('GRADE', 'CATEGORY', 'SPECIALISATION', 'FIELD_CODE', 'CLASS', 'PERMIT_TYPE');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('APPLICANT', 'REGISTERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationKind" AS ENUM ('NEW', 'RENEWAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "ApplicationChannel" AS ENUM ('COUNTER', 'POST', 'EMAIL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('RECEIVED', 'RESUBMISSION_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationOutcome" AS ENUM ('APPROVE', 'RESUBMIT', 'REJECT', 'LAPSE');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('NOT_CHECKED', 'VERIFIED', 'NOT_IN_ORDER');

-- CreateEnum
CREATE TYPE "SupplierListKind" AS ENUM ('ENTITY_TYPE', 'COUNTRY');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "supplierApplicationId" TEXT;

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "supplierApplicationId" TEXT,
ADD COLUMN     "supplierDocumentId" TEXT;

-- CreateTable
CREATE TABLE "RegistrationValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "kind" "RegistrationValueKind" NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "parentCode" TEXT,
    "rank" INTEGER,
    "valueCeiling" DECIMAL(18,2),
    "ceilingProvenance" "Provenance",
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "RegistrationValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDocumentType" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "bodyId" TEXT,
    "valueKinds" "RegistrationValueKind"[] DEFAULT ARRAY[]::"RegistrationValueKind"[],
    "expires" BOOLEAN,
    "mandatoryAtRegistration" BOOLEAN,
    "notApplicableAllowed" BOOLEAN,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "SupplierDocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierListValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "list" "SupplierListKind" NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "provenance" "Provenance" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "SupplierListValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "verificationNoticeEn" TEXT,
    "verificationNoticeMs" TEXT,
    "noticeProvenance" "Provenance",
    "governingSource" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "registeredName" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "registrationNoKey" TEXT NOT NULL,
    "entityTypeCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "registeredAddress" TEXT NOT NULL,
    "companyEmail" TEXT NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'APPLICANT',
    "registeredOn" TIMESTAMP(3),
    "erpVendorCode" TEXT,
    "erpSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "retiredOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierApplication" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "ApplicationKind" NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "channel" "ApplicationChannel" NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "declarationSignedOn" TIMESTAMP(3),
    "epaymentFormReceivedOn" TIMESTAMP(3),
    "status" "ApplicationStatus" NOT NULL DEFAULT 'RECEIVED',
    "resubmitBy" TIMESTAMP(3),
    "lapsedRecordedAt" TIMESTAMP(3),
    "submittedByPersonId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDecision" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "outcome" "ApplicationOutcome" NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "resubmitBy" TIMESTAMP(3),
    "decidedByPersonId" TEXT,
    "decidedOn" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "policySnapshot" JSONB,

    CONSTRAINT "ApplicationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResubmissionItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "supplierDocumentId" TEXT,
    "documentTypeId" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,

    CONSTRAINT "ResubmissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "typeLabelSnapshot" TEXT NOT NULL,
    "applicationId" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "issuingAuthority" TEXT NOT NULL DEFAULT '',
    "issuedOn" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "expiresOn" TIMESTAMP(3),
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "supersedesId" TEXT,
    "lodgedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "verification" "VerificationState" NOT NULL DEFAULT 'NOT_CHECKED',
    "verifiedByPersonId" TEXT,
    "verifiedOn" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SupplierDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDocumentValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "registrationValueId" TEXT NOT NULL,
    "kind" "RegistrationValueKind" NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,

    CONSTRAINT "SupplierDocumentValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationValue_bodyId_kind_code_key" ON "RegistrationValue"("bodyId", "kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDocumentType_organisationId_code_key" ON "SupplierDocumentType"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierListValue_organisationId_list_code_key" ON "SupplierListValue"("organisationId", "list", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPolicy_organisationId_key" ON "SupplierPolicy"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organisationId_reference_key" ON "Supplier"("organisationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organisationId_registrationNoKey_key" ON "Supplier"("organisationId", "registrationNoKey");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organisationId_erpVendorCode_key" ON "Supplier"("organisationId", "erpVendorCode");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierApplication_supplierId_idx" ON "SupplierApplication"("supplierId");

-- CreateIndex
CREATE INDEX "ApplicationDecision_applicationId_idx" ON "ApplicationDecision"("applicationId");

-- CreateIndex
CREATE INDEX "ResubmissionItem_decisionId_idx" ON "ResubmissionItem"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDocument_supersedesId_key" ON "SupplierDocument"("supersedesId");

-- CreateIndex
CREATE INDEX "SupplierDocument_supplierId_idx" ON "SupplierDocument"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDocumentValue_documentId_registrationValueId_key" ON "SupplierDocumentValue"("documentId", "registrationValueId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_supplierApplicationId_idx" ON "ApprovalInstance"("supplierApplicationId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_supplierDocumentId_idx" ON "DocumentAttachment"("supplierDocumentId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_supplierApplicationId_idx" ON "DocumentAttachment"("supplierApplicationId");

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_supplierApplicationId_fkey" FOREIGN KEY ("supplierApplicationId") REFERENCES "SupplierApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_supplierDocumentId_fkey" FOREIGN KEY ("supplierDocumentId") REFERENCES "SupplierDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_supplierApplicationId_fkey" FOREIGN KEY ("supplierApplicationId") REFERENCES "SupplierApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationValue" ADD CONSTRAINT "RegistrationValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationValue" ADD CONSTRAINT "RegistrationValue_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "RegistrationBody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocumentType" ADD CONSTRAINT "SupplierDocumentType_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocumentType" ADD CONSTRAINT "SupplierDocumentType_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "RegistrationBody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierListValue" ADD CONSTRAINT "SupplierListValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_submittedByPersonId_fkey" FOREIGN KEY ("submittedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "SupplierApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResubmissionItem" ADD CONSTRAINT "ResubmissionItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResubmissionItem" ADD CONSTRAINT "ResubmissionItem_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ApplicationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResubmissionItem" ADD CONSTRAINT "ResubmissionItem_supplierDocumentId_fkey" FOREIGN KEY ("supplierDocumentId") REFERENCES "SupplierDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResubmissionItem" ADD CONSTRAINT "ResubmissionItem_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "SupplierDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SupplierDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "SupplierApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "SupplierDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocumentValue" ADD CONSTRAINT "SupplierDocumentValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocumentValue" ADD CONSTRAINT "SupplierDocumentValue_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SupplierDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocumentValue" ADD CONSTRAINT "SupplierDocumentValue_registrationValueId_fkey" FOREIGN KEY ("registrationValueId") REFERENCES "RegistrationValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the supplier's
-- document and the supplier's application added (6.15). Prisma does not model CHECK constraints, so they
-- live here, in attachFault, and in the schema-vs-CHECK test (owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'WITHDRAWAL_LETTER' AND "bidWithdrawalId" IS NOT NULL)
    OR ("purpose" = 'VALIDITY_CONSENT' AND "validityExtensionId" IS NOT NULL)
    OR ("purpose" = 'SIGNED_SCHEDULE' AND "openingId" IS NOT NULL)
    OR ("purpose" IN ('REPORT_DRAWINGS', 'SIGNED_REPORT', 'SIGNED_PROPOSAL_PAPER') AND "evaluationId" IS NOT NULL)
    OR ("purpose" IN ('MEETING_MINUTES', 'TENDERER_CONFIRMATION') AND "evaluationMeetingId" IS NOT NULL)
    OR ("purpose" IN ('CPR_REPORT', 'COMMUNICATION') AND "evaluationBidderId" IS NOT NULL)
    OR ("purpose" = 'SUPPLIER_DOCUMENT' AND "supplierDocumentId" IS NOT NULL)
    OR ("purpose" IN ('SUPPLIER_DECLARATION', 'SUPPLIER_EPAYMENT_FORM') AND "supplierApplicationId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- A supplier matter's route names the application it decides, and only a supplier matter does.
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_supplier_matter"
  CHECK (("supplierApplicationId" IS NULL) = ("matterKind" <> 'SUPPLIER'));

-- FR-VND-004: a checked document names who checked it and on which day, and an unchecked one does not.
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_checked_by"
  CHECK (("verification" = 'NOT_CHECKED') = ("verifiedByPersonId" IS NULL AND "verifiedOn" IS NULL));

-- FR-VND-007: a resubmission request carries its deadline.
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_resubmit_by"
  CHECK ("status" <> 'RESUBMISSION_REQUESTED' OR "resubmitBy" IS NOT NULL);

-- One application open at a time per supplier, and one primary contact.
CREATE UNIQUE INDEX "SupplierApplication_one_open" ON "SupplierApplication"("supplierId") WHERE "status" IN ('RECEIVED', 'RESUBMISSION_REQUESTED') AND "lapsedRecordedAt" IS NULL;
CREATE UNIQUE INDEX "SupplierContact_one_primary" ON "SupplierContact"("supplierId") WHERE "isPrimary" AND "retiredOn" IS NULL;

-- FR-VND-003: a grade's rank is unique among its body's grades.
CREATE UNIQUE INDEX "RegistrationValue_one_rank" ON "RegistrationValue"("bodyId", "rank") WHERE "rank" IS NOT NULL;
ALTER TABLE "RegistrationValue" ADD CONSTRAINT "RegistrationValue_rank_grade_only"
  CHECK ("rank" IS NULL OR ("kind" = 'GRADE' AND "rank" >= 1));
