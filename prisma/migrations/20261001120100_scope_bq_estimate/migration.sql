-- CreateEnum
CREATE TYPE "BqStatus" AS ENUM ('DRAFT', 'FINALISED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BqScopedBy" AS ENUM ('IMPLEMENTING_DEPARTMENT', 'SPECIALIST_CONTRACTOR', 'COORDINATION_MEETING');

-- CreateEnum
CREATE TYPE "BqItemKind" AS ENUM ('MEASURED', 'PRIME_COST_SUM', 'PROVISIONAL_SUM');

-- CreateEnum
CREATE TYPE "BqRateSource" AS ENUM ('ENTERED', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "PanelStatus" AS ENUM ('DRAFT', 'VERIFIED');

-- CreateEnum
CREATE TYPE "EstimateState" AS ENUM ('DRAFT', 'LODGED', 'DISCLOSED', 'VOID');

-- CreateEnum
CREATE TYPE "EstimateEventKind" AS ENUM ('PREPARED', 'AMENDED', 'LODGED', 'RETAINED', 'LATE_OVERRIDE', 'DISCLOSED', 'VOIDED');

-- AlterTable
ALTER TABLE "ContractBasis" ADD COLUMN     "requiresBq" BOOLEAN,
ADD COLUMN     "requiresBqProvenance" "Provenance";

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "specificationPanelId" TEXT;

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "requiresCompanyEstimate" BOOLEAN,
ADD COLUMN     "requiresCompanyEstimateProvenance" "Provenance";

-- CreateTable
CREATE TABLE "ScopePolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "measurementStandardLabel" TEXT,
    "measurementStandardProvenance" "Provenance",
    "bqPreparerQualificationCode" TEXT,
    "estimateLeadDays" INTEGER,
    "estimateLeadProvenance" "Provenance",
    "estimateCustodianRoleCode" TEXT,
    "estimateAuditRoleCode" TEXT,
    "estimateOverrideRoleCode" TEXT,
    "panelSignatoryLimit" INTEGER,
    "panelSignatoryLimitProvenance" "Provenance",
    "panelContractKindTaxonomyCode" TEXT,
    "panelProjectStatusTaxonomyCode" TEXT,
    "benchmarkLabelEn" TEXT,
    "benchmarkLabelMs" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonQualification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "qualificationCode" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "evidenceNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PersonQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BqTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMs" TEXT,
    "deliverableKind" "DeliverableKind",
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "BqTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BqTemplateSection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleMs" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BqTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecPanelColumn" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "orgUnitCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "SpecPanelColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BqVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" "BqStatus" NOT NULL DEFAULT 'DRAFT',
    "templateCode" TEXT,
    "scopedBy" "BqScopedBy",
    "scopeStatement" TEXT NOT NULL DEFAULT '',
    "followsStandard" BOOLEAN,
    "departuresText" TEXT NOT NULL DEFAULT '',
    "standardLabelSnapshot" TEXT,
    "preparerPersonId" TEXT,
    "preparerQualificationSnapshot" JSONB,
    "provisionalExcludedFromFirm" BOOLEAN,
    "finalisedAt" TIMESTAMP(3),
    "totalsSnapshot" JSONB,
    "revisionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BqVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BqSection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BqSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BqItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "itemRef" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "kind" "BqItemKind" NOT NULL DEFAULT 'MEASURED',
    "quantity" DECIMAL(18,3),
    "rate" DECIMAL(18,2),
    "amount" DECIMAL(18,2),
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "rateSource" "BqRateSource" NOT NULL DEFAULT 'ENTERED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecificationPanel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "contractKindCode" TEXT,
    "contractKindOther" TEXT NOT NULL DEFAULT '',
    "projectStatusCode" TEXT,
    "projectStatusOther" TEXT NOT NULL DEFAULT '',
    "currentRevisionNo" TEXT,
    "currentRevisionOn" TIMESTAMP(3),
    "revisedRevisionNo" TEXT,
    "revisedRevisionOn" TIMESTAMP(3),
    "completionPeriodText" TEXT NOT NULL DEFAULT '',
    "bqVersionId" TEXT,
    "status" "PanelStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedAt" TIMESTAMP(3),
    "verifiedSnapshot" JSONB,

    CONSTRAINT "SpecificationPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecPanelVerification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "columnCode" TEXT NOT NULL,
    "columnLabelSnapshot" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "verifiedOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "SpecPanelVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEstimate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "preparerPersonId" TEXT NOT NULL,
    "classification" "SecurityClass" NOT NULL DEFAULT 'SULIT',
    "state" "EstimateState" NOT NULL DEFAULT 'DRAFT',
    "currentVersionNo" INTEGER NOT NULL DEFAULT 1,
    "lodgedAt" TIMESTAMP(3),
    "retainedPlace" TEXT NOT NULL DEFAULT '',
    "disclosedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEstimateVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "preparedOn" TIMESTAMP(3) NOT NULL,
    "preparerPersonId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "bqVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "kind" "EstimateEventKind" NOT NULL,
    "personId" TEXT,
    "capacity" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "versionNo" INTEGER,
    "copyNo" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScopePolicy_organisationId_key" ON "ScopePolicy"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_organisationId_code_key" ON "Qualification"("organisationId", "code");

-- CreateIndex
CREATE INDEX "PersonQualification_personId_idx" ON "PersonQualification"("personId");

-- CreateIndex
CREATE INDEX "PersonQualification_organisationId_qualificationCode_idx" ON "PersonQualification"("organisationId", "qualificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "BqTemplate_organisationId_code_key" ON "BqTemplate"("organisationId", "code");

-- CreateIndex
CREATE INDEX "BqTemplateSection_templateId_idx" ON "BqTemplateSection"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecPanelColumn_organisationId_code_key" ON "SpecPanelColumn"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BqVersion_exerciseId_versionNo_key" ON "BqVersion"("exerciseId", "versionNo");

-- CreateIndex
CREATE INDEX "BqSection_versionId_idx" ON "BqSection"("versionId");

-- CreateIndex
CREATE INDEX "BqItem_sectionId_idx" ON "BqItem"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecificationPanel_exerciseId_key" ON "SpecificationPanel"("exerciseId");

-- CreateIndex
CREATE INDEX "SpecPanelVerification_panelId_idx" ON "SpecPanelVerification"("panelId");

-- CreateIndex
CREATE INDEX "CompanyEstimate_exerciseId_idx" ON "CompanyEstimate"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEstimateVersion_estimateId_versionNo_key" ON "CompanyEstimateVersion"("estimateId", "versionNo");

-- CreateIndex
CREATE INDEX "EstimateEvent_estimateId_idx" ON "EstimateEvent"("estimateId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_specificationPanelId_idx" ON "DocumentAttachment"("specificationPanelId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_specificationPanelId_fkey" FOREIGN KEY ("specificationPanelId") REFERENCES "SpecificationPanel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopePolicy" ADD CONSTRAINT "ScopePolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonQualification" ADD CONSTRAINT "PersonQualification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonQualification" ADD CONSTRAINT "PersonQualification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqTemplate" ADD CONSTRAINT "BqTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqTemplateSection" ADD CONSTRAINT "BqTemplateSection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqTemplateSection" ADD CONSTRAINT "BqTemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BqTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecPanelColumn" ADD CONSTRAINT "SpecPanelColumn_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqVersion" ADD CONSTRAINT "BqVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqVersion" ADD CONSTRAINT "BqVersion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqVersion" ADD CONSTRAINT "BqVersion_preparerPersonId_fkey" FOREIGN KEY ("preparerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqSection" ADD CONSTRAINT "BqSection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqSection" ADD CONSTRAINT "BqSection_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BqVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqItem" ADD CONSTRAINT "BqItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqItem" ADD CONSTRAINT "BqItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BqSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecificationPanel" ADD CONSTRAINT "SpecificationPanel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecificationPanel" ADD CONSTRAINT "SpecificationPanel_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecificationPanel" ADD CONSTRAINT "SpecificationPanel_bqVersionId_fkey" FOREIGN KEY ("bqVersionId") REFERENCES "BqVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecPanelVerification" ADD CONSTRAINT "SpecPanelVerification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecPanelVerification" ADD CONSTRAINT "SpecPanelVerification_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SpecificationPanel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecPanelVerification" ADD CONSTRAINT "SpecPanelVerification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimate" ADD CONSTRAINT "CompanyEstimate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimate" ADD CONSTRAINT "CompanyEstimate_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimate" ADD CONSTRAINT "CompanyEstimate_preparerPersonId_fkey" FOREIGN KEY ("preparerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "CompanyEstimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_preparerPersonId_fkey" FOREIGN KEY ("preparerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_bqVersionId_fkey" FOREIGN KEY ("bqVersionId") REFERENCES "BqVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateEvent" ADD CONSTRAINT "EstimateEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateEvent" ADD CONSTRAINT "EstimateEvent_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "CompanyEstimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateEvent" ADD CONSTRAINT "EstimateEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the
-- specification panel added. Prisma does not model CHECK constraints, so they live here,
-- in attachFault, and in the schema-vs-CHECK test (src/lib/documents/owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- OD-2: at most one company estimate not void per exercise (backstop to the lib and the lock).
CREATE UNIQUE INDEX "CompanyEstimate_one_live_per_exercise" ON "CompanyEstimate"("exerciseId") WHERE "state" <> 'VOID';

-- At most one draft bill of quantities per exercise (backstop to the lib and the lock).
CREATE UNIQUE INDEX "BqVersion_one_draft_per_exercise" ON "BqVersion"("exerciseId") WHERE "status" = 'DRAFT';

-- FR-EST-008: the estimate is SULIT from creation and never lowered (SULIT is the highest class).
ALTER TABLE "CompanyEstimate" ADD CONSTRAINT "CompanyEstimate_sulit" CHECK ("classification" = 'SULIT');
ALTER TABLE "CompanyEstimate" ADD CONSTRAINT "CompanyEstimate_void_reason"
  CHECK ("state" <> 'VOID' OR ("voidedAt" IS NOT NULL AND length(btrim("voidReason")) > 0));

-- FR-EST-009: a version counts from one, its figure is positive, and from version two it carries its reason.
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_version_positive" CHECK ("versionNo" >= 1);
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_value_positive" CHECK ("value" > 0);
ALTER TABLE "CompanyEstimateVersion" ADD CONSTRAINT "CompanyEstimateVersion_reason_from_v2"
  CHECK ("versionNo" = 1 OR length(btrim("reason")) > 0);

ALTER TABLE "BqVersion" ADD CONSTRAINT "BqVersion_version_positive" CHECK ("versionNo" >= 1);
ALTER TABLE "PersonQualification" ADD CONSTRAINT "PersonQualification_period"
  CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
