-- 6.14 increment 1: the certificate core (ADR 0022), the template register's signature blocks and distribution lists, and the routing sheet's configuration and checks (ADR 0023). Additive: every table is new and ships empty.
-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'IN_ROUTING', 'SIGNING', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "SignatureBlockKind" AS ENUM ('RECOMMENDING', 'AUTHORISING', 'CONTRACTOR', 'WITNESS', 'APPLICANT', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "SignatureOfficeRule" AS ENUM ('SO', 'SO_REP', 'RECOMMENDING_OFFICER', 'CONTRACTOR', 'WITNESS', 'NAMED_OFFICE');

-- CreateEnum
CREATE TYPE "SignatureDecision" AS ENUM ('SUPPORTED', 'NOT_SUPPORTED');

-- CreateEnum
CREATE TYPE "DistributionCondition" AS ENUM ('NONE', 'GUARANTOR_EXISTS', 'CONSULTANT_ENGAGED');

-- CreateEnum
CREATE TYPE "RoutingCheckKind" AS ENUM ('CHECKED', 'VERIFIED', 'ENDORSED');

-- CreateEnum
CREATE TYPE "RoutingSubject" AS ENUM ('CERTIFICATE', 'AWARD');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "certificateId" TEXT;

-- AlterTable
ALTER TABLE "IssuedCopy" ADD COLUMN     "ackRequired" BOOLEAN,
ADD COLUMN     "certificateId" TEXT,
ADD COLUMN     "distributionCode" TEXT,
ADD COLUMN     "isOriginal" BOOLEAN,
ADD COLUMN     "mandatory" BOOLEAN;

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "CertificateKind" NOT NULL,
    "number" TEXT,
    "sequence" INTEGER,
    "status" "CertificateStatus" NOT NULL DEFAULT 'DRAFT',
    "sectionId" TEXT,
    "templateId" TEXT,
    "templateRevision" JSONB,
    "pinnedAt" TIMESTAMP(3),
    "baselineId" TEXT NOT NULL,
    "computedSnapshot" JSONB,
    "certificateDate" TIMESTAMP(3),
    "certificateDateCorrectedFrom" TIMESTAMP(3),
    "certificateDateCorrectionReason" TEXT NOT NULL DEFAULT '',
    "routingTypeId" TEXT,
    "routingSnapshot" JSONB,
    "routingReceivedOn" TIMESTAMP(3),
    "routingReceivedRecordedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedOn" TIMESTAMP(3) NOT NULL,
    "voidReason" TEXT NOT NULL DEFAULT '',
    "voidedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "issueSnapshot" JSONB,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateSignature" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "blockOrder" INTEGER NOT NULL,
    "blockKind" "SignatureBlockKind" NOT NULL,
    "blockLabel" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "officeCode" TEXT,
    "officeLabel" TEXT,
    "delegationId" TEXT,
    "icMasked" TEXT,
    "decision" "SignatureDecision",
    "decisionCap" DECIMAL(18,2),
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "refusalNote" TEXT NOT NULL DEFAULT '',
    "signedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateOverride" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "computed" TEXT NOT NULL,
    "overridden" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateFormCode" TEXT NOT NULL DEFAULT '',
    "templateRevisionDate" TIMESTAMP(3),
    "templateBodyVersion" INTEGER NOT NULL,
    "language" "DocumentLanguage" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fields" JSONB NOT NULL,
    "renderedText" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSignatureBlock" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "blockOrder" INTEGER NOT NULL,
    "blockKind" "SignatureBlockKind" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "datesCertificate" BOOLEAN NOT NULL DEFAULT false,
    "officeRule" "SignatureOfficeRule" NOT NULL,
    "officeCode" TEXT,
    "delegable" BOOLEAN,
    "carriesDecision" BOOLEAN NOT NULL DEFAULT false,
    "refusalAllowed" BOOLEAN NOT NULL DEFAULT false,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FormSignatureBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDistribution" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "recipientCode" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "mandatory" BOOLEAN NOT NULL,
    "ackRequired" BOOLEAN NOT NULL,
    "condition" "DistributionCondition" NOT NULL,
    "isOriginal" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "FormDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingSheetType" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "subject" "RoutingSubject" NOT NULL,
    "certificateKind" "CertificateKind",
    "templateId" TEXT,
    "upperEdgeInclusive" BOOLEAN,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredOn" TIMESTAMP(3),

    CONSTRAINT "RoutingSheetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingCheckDef" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "RoutingCheckKind" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelMs" TEXT,
    "officeCode" TEXT,
    "targetDays" INTEGER,

    CONSTRAINT "RoutingCheckDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingTarget" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "pctMin" DECIMAL(9,4),
    "pctMax" DECIMAL(9,4),
    "targetDays" INTEGER NOT NULL,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RoutingTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingCheck" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT,
    "iteration" INTEGER NOT NULL,
    "defOrder" INTEGER NOT NULL,
    "kind" "RoutingCheckKind" NOT NULL,
    "label" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "on" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Certificate_contractId_idx" ON "Certificate"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_organisationId_number_key" ON "Certificate"("organisationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_contractId_kind_sequence_key" ON "Certificate"("contractId", "kind", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateSignature_certificateId_blockOrder_key" ON "CertificateSignature"("certificateId", "blockOrder");

-- CreateIndex
CREATE INDEX "CertificateOverride_certificateId_idx" ON "CertificateOverride"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateDocument_certificateId_language_version_key" ON "CertificateDocument"("certificateId", "language", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FormSignatureBlock_templateId_blockOrder_key" ON "FormSignatureBlock"("templateId", "blockOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FormDistribution_templateId_recipientCode_key" ON "FormDistribution"("templateId", "recipientCode");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingSheetType_organisationId_code_key" ON "RoutingSheetType"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingCheckDef_typeId_order_key" ON "RoutingCheckDef"("typeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingCheck_certificateId_iteration_defOrder_key" ON "RoutingCheck"("certificateId", "iteration", "defOrder");

-- CreateIndex
CREATE INDEX "ApprovalInstance_certificateId_idx" ON "ApprovalInstance"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCopy_certificateId_copyNo_key" ON "IssuedCopy"("certificateId", "copyNo");

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ContractSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ContractBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_routingTypeId_fkey" FOREIGN KEY ("routingTypeId") REFERENCES "RoutingSheetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateSignature" ADD CONSTRAINT "CertificateSignature_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateSignature" ADD CONSTRAINT "CertificateSignature_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateSignature" ADD CONSTRAINT "CertificateSignature_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateSignature" ADD CONSTRAINT "CertificateSignature_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateOverride" ADD CONSTRAINT "CertificateOverride_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateOverride" ADD CONSTRAINT "CertificateOverride_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateOverride" ADD CONSTRAINT "CertificateOverride_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateDocument" ADD CONSTRAINT "CertificateDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateDocument" ADD CONSTRAINT "CertificateDocument_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateDocument" ADD CONSTRAINT "CertificateDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSignatureBlock" ADD CONSTRAINT "FormSignatureBlock_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSignatureBlock" ADD CONSTRAINT "FormSignatureBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDistribution" ADD CONSTRAINT "FormDistribution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDistribution" ADD CONSTRAINT "FormDistribution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingSheetType" ADD CONSTRAINT "RoutingSheetType_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingSheetType" ADD CONSTRAINT "RoutingSheetType_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingCheckDef" ADD CONSTRAINT "RoutingCheckDef_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingCheckDef" ADD CONSTRAINT "RoutingCheckDef_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "RoutingSheetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingTarget" ADD CONSTRAINT "RoutingTarget_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingTarget" ADD CONSTRAINT "RoutingTarget_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "RoutingSheetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingCheck" ADD CONSTRAINT "RoutingCheck_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingCheck" ADD CONSTRAINT "RoutingCheck_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingCheck" ADD CONSTRAINT "RoutingCheck_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- X-6: a controlled copy now has a contract or a certificate as its owner, exactly one. The CHECK is rebuilt from the full owner list.
ALTER TABLE "IssuedCopy" DROP CONSTRAINT "IssuedCopy_one_owner";
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_one_owner"
  CHECK (num_nonnulls("contractId", "certificateId") = 1);

-- FR-CRT-006: a certificate's copy carries its distribution row's code and flags as pinned, a contract's copy none of them.
ALTER TABLE "IssuedCopy" ADD CONSTRAINT "IssuedCopy_certificate_flags"
  CHECK ((("certificateId" IS NULL) = ("distributionCode" IS NULL)) AND (("certificateId" IS NULL) = ("mandatory" IS NULL)) AND (("certificateId" IS NULL) = ("ackRequired" IS NULL)) AND (("certificateId" IS NULL) = ("isOriginal" IS NULL)));

-- Pre-check, before the CHECK below: no route may already be a CERTIFICATE matter (the value arrived in the migration before this one, so none can). Fails with the message as the error if one is.
SELECT CAST((SELECT 'Pre-check failed: an approval route is already a CERTIFICATE matter with no certificate named, so ApprovalInstance_certificate_matter cannot be added. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "ApprovalInstance" WHERE "matterKind" = 'CERTIFICATE')) AS INTEGER);

-- ADR 0022: a CERTIFICATE route names its certificate, and no other route names one.
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_certificate_matter"
  CHECK (("certificateId" IS NOT NULL) = ("matterKind" = 'CERTIFICATE'));

-- ADR 0022: a number, a sequence, the moment of issue and the issue snapshot exist exactly when the certificate is issued.
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_issued"
  CHECK ((("number" IS NOT NULL) = ("status" = 'ISSUED')) AND (("sequence" IS NOT NULL) = ("status" = 'ISSUED')) AND (("issuedAt" IS NOT NULL) = ("status" = 'ISSUED')) AND (("issueSnapshot" IS NOT NULL) = ("status" = 'ISSUED')));

-- A void certificate says when and why, and nothing else is void.
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_void"
  CHECK ((("status" = 'VOID') = ("voidedAt" IS NOT NULL)) AND ("status" <> 'VOID' OR btrim("voidReason") <> ''));

-- FR-CRT-005: a corrected certificate date keeps the day it was first and the reason.
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_date_correction"
  CHECK ("certificateDateCorrectedFrom" IS NULL OR (btrim("certificateDateCorrectionReason") <> '' AND "certificateDate" IS NOT NULL));

-- FR-CRT-008: DATE (1) is recorded with the moment it was recorded.
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_routing_received"
  CHECK (("routingReceivedOn" IS NULL) = ("routingReceivedRecordedAt" IS NULL));

-- OD-2 A: the template revision is pinned once, with the moment.
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_pinned"
  CHECK (("templateRevision" IS NULL) = ("pinnedAt" IS NULL));

-- FR-CRT-003: an override is never without its justification.
ALTER TABLE "CertificateOverride" ADD CONSTRAINT "CertificateOverride_justified"
  CHECK (btrim("justification") <> '');

-- A contractor's refusal is recorded against no Person.
ALTER TABLE "CertificateSignature" ADD CONSTRAINT "CertificateSignature_refusal"
  CHECK (NOT "refused" OR "personId" IS NULL);

-- FR-CRT-004: a named-office block names its office, and only a contractor's block may be refused.
ALTER TABLE "FormSignatureBlock" ADD CONSTRAINT "FormSignatureBlock_office"
  CHECK ((("officeRule" = 'NAMED_OFFICE') = ("officeCode" IS NOT NULL)) AND (NOT "refusalAllowed" OR "officeRule" = 'CONTRACTOR'));

-- FR-CRT-005: at most one block on a form dates the certificate.
CREATE UNIQUE INDEX "FormSignatureBlock_one_dating_block" ON "FormSignatureBlock"("templateId") WHERE "datesCertificate";

-- FR-CRT-008: a band is (min, max] or [min, max) with min below max, and a target is a positive number of days.
ALTER TABLE "RoutingTarget" ADD CONSTRAINT "RoutingTarget_band"
  CHECK ("targetDays" > 0 AND ("pctMin" IS NULL OR "pctMin" >= 0) AND ("pctMin" IS NULL OR "pctMax" IS NULL OR "pctMin" < "pctMax"));

ALTER TABLE "RoutingCheckDef" ADD CONSTRAINT "RoutingCheckDef_days"
  CHECK ("targetDays" IS NULL OR "targetDays" > 0);

-- A certificate kind is named only on a certificate sheet.
ALTER TABLE "RoutingSheetType" ADD CONSTRAINT "RoutingSheetType_subject_kind"
  CHECK ("subject" = 'CERTIFICATE' OR "certificateKind" IS NULL);

-- A recorded check has exactly one owner: a certificate (the award's sheet adds its own key, with this CHECK rebuilt).
ALTER TABLE "RoutingCheck" ADD CONSTRAINT "RoutingCheck_one_owner"
  CHECK (num_nonnulls("certificateId") = 1);
