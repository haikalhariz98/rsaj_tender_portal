-- CreateEnum
CREATE TYPE "RateScheduleStatus" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "BqItem" ADD COLUMN     "rateItemCode" TEXT,
ADD COLUMN     "rateScheduleId" TEXT,
ADD COLUMN     "scheduleEffectiveFromSnapshot" TIMESTAMP(3),
ADD COLUMN     "scheduleIssueSnapshot" TEXT,
ADD COLUMN     "scheduleLabelSnapshot" TEXT;

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "bqVersionId" TEXT;

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "bqVersionId" TEXT;

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "scopeApprovalProvenance" "Provenance",
ADD COLUMN     "scopeApprovalRequired" BOOLEAN,
ADD COLUMN     "scopeCommitteeCode" TEXT;

-- CreateTable
CREATE TABLE "RateSchedule" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "issueNo" INTEGER NOT NULL,
    "status" "RateScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "issuedOn" TIMESTAMP(3),
    "issuedByPersonId" TEXT,
    "supersededOn" TIMESTAMP(3),
    "governingSource" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateScheduleItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionMs" TEXT,
    "unit" TEXT NOT NULL DEFAULT '',
    "rate" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateSchedule_organisationId_label_issueNo_key" ON "RateSchedule"("organisationId", "label", "issueNo");

-- CreateIndex
CREATE UNIQUE INDEX "RateScheduleItem_scheduleId_code_key" ON "RateScheduleItem"("scheduleId", "code");

-- CreateIndex
CREATE INDEX "BqItem_rateScheduleId_idx" ON "BqItem"("rateScheduleId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_bqVersionId_idx" ON "CommitteeDecision"("bqVersionId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_bqVersionId_idx" ON "DocumentAttachment"("bqVersionId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_bqVersionId_fkey" FOREIGN KEY ("bqVersionId") REFERENCES "BqVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_bqVersionId_fkey" FOREIGN KEY ("bqVersionId") REFERENCES "BqVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BqItem" ADD CONSTRAINT "BqItem_rateScheduleId_fkey" FOREIGN KEY ("rateScheduleId") REFERENCES "RateSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateScheduleItem" ADD CONSTRAINT "RateScheduleItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateScheduleItem" ADD CONSTRAINT "RateScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "RateSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the
-- bill of quantities version added for its imported CSV (6.2 Q-3). Prisma does not model
-- CHECK constraints, so they live here, in attachFault, and in the schema-vs-CHECK test
-- (src/lib/documents/owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" = 'SIGNED_MINUTES' AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE') AND "exerciseId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- OD-9: only a SCOPE matter names a bill version. One way only, so the version's SET NULL
-- on delete never breaks it (a tabled version is finalised and never deleted).
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_bq_version_scope"
  CHECK ("bqVersionId" IS NULL OR "matterKind" = 'SCOPE');

-- FR-EST-004: an issue is numbered from 1, an issued or superseded issue says when it took
-- effect and when it was issued, a superseded one when, and a rate is never negative.
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_issue_positive" CHECK ("issueNo" >= 1);
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_issued_dates"
  CHECK ("status" = 'DRAFT' OR ("effectiveFrom" IS NOT NULL AND "issuedOn" IS NOT NULL));
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_superseded_on"
  CHECK ("status" <> 'SUPERSEDED' OR "supersededOn" IS NOT NULL);
ALTER TABLE "RateScheduleItem" ADD CONSTRAINT "RateScheduleItem_rate_not_negative" CHECK ("rate" >= 0);

-- At most one issue of a schedule in the ISSUED state (issuing supersedes the one before).
CREATE UNIQUE INDEX "RateSchedule_one_issued_per_label" ON "RateSchedule"("organisationId", "label") WHERE "status" = 'ISSUED';

-- A line priced from a schedule names the issue and the item, and only such a line does.
ALTER TABLE "BqItem" ADD CONSTRAINT "BqItem_schedule_source"
  CHECK (("rateSource" = 'SCHEDULE') = ("rateScheduleId" IS NOT NULL AND "rateItemCode" IS NOT NULL));
