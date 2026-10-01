-- Document store (platform module, ADR 0011). Additive: new tables ship empty, new columns are null.

-- CreateEnum
CREATE TYPE "SecurityClass" AS ENUM ('PUBLIC', 'INTERNAL', 'SULIT');

-- CreateEnum
CREATE TYPE "RetentionTrigger" AS ENUM ('RECEIVED', 'OWNER_CLOSED', 'CONTRACT_FINAL_ACCOUNT');

-- CreateEnum
CREATE TYPE "DisposalMethod" AS ENUM ('DESTROY', 'TRANSFER_TO_ARCHIVES', 'REVIEW');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('STAGED', 'FILED');

-- CreateEnum
CREATE TYPE "ScanState" AS ENUM ('NOT_SCANNED', 'CLEAN', 'THREAT');

-- CreateEnum
CREATE TYPE "AttachmentPurpose" AS ENUM ('SIGNED_MINUTES', 'DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'HOLDER_RECOMMENDATION', 'SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE');

-- CreateEnum
CREATE TYPE "DocumentAccessKind" AS ENUM ('DOWNLOADED', 'REFUSED', 'VERIFIED', 'INTEGRITY_FAILED');

-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "dossierEvidenceSnapshot" JSONB,
ADD COLUMN     "returnScanSnapshot" JSONB;

-- AlterTable
ALTER TABLE "DocumentClass" ADD COLUMN     "classification" "SecurityClass",
ADD COLUMN     "disposalAuthorityRoleCode" TEXT,
ADD COLUMN     "disposalMethod" "DisposalMethod",
ADD COLUMN     "retentionTrigger" "RetentionTrigger";

-- CreateTable
CREATE TABLE "DocumentStorePolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "allowedMediaTypes" TEXT[],
    "maxBytes" BIGINT,
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentStorePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlobContent" (
    "organisationId" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlobContent_pkey" PRIMARY KEY ("organisationId","sha256")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentClassId" TEXT NOT NULL,
    "classificationSnapshot" "SecurityClass",
    "retentionSnapshot" JSONB NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'STAGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "receivedOn" TIMESTAMP(3),
    "recordedByPersonId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanState" "ScanState" NOT NULL DEFAULT 'NOT_SCANNED',
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "purpose" "AttachmentPurpose" NOT NULL,
    "versionId" TEXT NOT NULL,
    "meetingId" TEXT,
    "exerciseId" TEXT,
    "awardId" TEXT,
    "delegationId" TEXT,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detachedAt" TIMESTAMP(3),
    "detachReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placedByPersonId" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT NOT NULL DEFAULT '',
    "releasedByPersonId" TEXT,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "versionId" TEXT,
    "kind" "DocumentAccessKind" NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "offeredFilename" TEXT,
    "offeredBytes" BIGINT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentStorePolicy_organisationId_key" ON "DocumentStorePolicy"("organisationId");

-- CreateIndex
CREATE INDEX "Document_organisationId_status_idx" ON "Document"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Document_documentClassId_idx" ON "Document"("documentClassId");

-- CreateIndex
CREATE INDEX "DocumentVersion_organisationId_sha256_idx" ON "DocumentVersion"("organisationId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNo_key" ON "DocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE INDEX "DocumentAttachment_meetingId_idx" ON "DocumentAttachment"("meetingId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_exerciseId_idx" ON "DocumentAttachment"("exerciseId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_awardId_idx" ON "DocumentAttachment"("awardId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_delegationId_idx" ON "DocumentAttachment"("delegationId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_versionId_idx" ON "DocumentAttachment"("versionId");

-- CreateIndex
CREATE INDEX "LegalHold_documentId_idx" ON "LegalHold"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAccessEvent_organisationId_at_idx" ON "DocumentAccessEvent"("organisationId", "at");

-- CreateIndex
CREATE INDEX "DocumentAccessEvent_versionId_idx" ON "DocumentAccessEvent"("versionId");

-- AddForeignKey
ALTER TABLE "DocumentStorePolicy" ADD CONSTRAINT "DocumentStorePolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlobContent" ADD CONSTRAINT "BlobContent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentClassId_fkey" FOREIGN KEY ("documentClassId") REFERENCES "DocumentClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_organisationId_sha256_fkey" FOREIGN KEY ("organisationId", "sha256") REFERENCES "BlobContent"("organisationId", "sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_placedByPersonId_fkey" FOREIGN KEY ("placedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_releasedByPersonId_fkey" FOREIGN KEY ("releasedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessEvent" ADD CONSTRAINT "DocumentAccessEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessEvent" ADD CONSTRAINT "DocumentAccessEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: exactly one owner per attachment, and a purpose only on its own owner.
-- Prisma does not model CHECK constraints, so they live here and in attachFault.
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId") = 1);

ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- A version number counts from one, sizes are never negative, and a withdrawal carries its reason.
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_version_positive" CHECK ("versionNo" >= 1);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_size_not_negative" CHECK ("byteSize" >= 0);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_withdrawal_reason"
  CHECK ("withdrawnAt" IS NULL OR length(btrim("withdrawnReason")) > 0);
ALTER TABLE "BlobContent" ADD CONSTRAINT "BlobContent_size_matches" CHECK ("byteSize" = octet_length("bytes"));
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_detach_reason"
  CHECK ("detachedAt" IS NULL OR length(btrim("detachReason")) > 0);
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_reasons"
  CHECK (length(btrim("reason")) > 0 AND ("releasedAt" IS NULL OR length(btrim("releaseReason")) > 0));

-- Backfill: none. Every new column is null and every new table ships empty. An award
-- accepted before this migration keeps a null return-scan snapshot, which is how it is
-- told apart as accepted before scans were required (OD-5).
