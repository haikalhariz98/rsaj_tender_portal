-- CreateEnum
CREATE TYPE "ContractorSubmissionKind" AS ENUM ('WORK_PROGRAMME', 'INTERIM_CLAIM', 'MATERIALS_ON_SITE', 'DELAY_NOTICE', 'DEFECTS_RECTIFIED', 'STATUTORY_DECLARATION');

-- CreateEnum
CREATE TYPE "ContractorSubmissionOutcome" AS ENUM ('TAKEN_UP', 'RETURNED');

-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('IMPORTANT', 'POLICY', 'NOTICE');

-- AlterTable
ALTER TABLE "CertificateSignature" ADD COLUMN     "signedBySupplierAccountId" TEXT;

-- AlterTable
ALTER TABLE "SiteDiaryEntry" ADD COLUMN     "agentAttestedAt" TIMESTAMP(3),
ADD COLUMN     "agentAttestedBySupplierAccountId" TEXT,
ADD COLUMN     "disputedBySupplierAccountId" TEXT;

-- CreateTable
CREATE TABLE "ContractorSubmissionSetting" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "ContractorSubmissionKind" NOT NULL,
    "serviceLevelDays" INTEGER,
    "provenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ContractorSubmissionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorSubmission" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "ContractorSubmissionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "aboutDay" TIMESTAMP(3),
    "submittedBySupplierAccountId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3),
    "routedToRoleCode" TEXT,
    "routedToRoleLabel" TEXT,
    "serviceLevelDays" INTEGER,
    "dueOn" TIMESTAMP(3),
    "outcome" "ContractorSubmissionOutcome",
    "outcomeNote" TEXT NOT NULL DEFAULT '',
    "decidedByPersonId" TEXT,
    "decidedOn" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ContractorSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorSubmissionLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ContractorSubmissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "category" "AnnouncementCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedOn" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "publishedByPersonId" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByPersonId" TEXT,
    "withdrawReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractorSubmissionSetting_organisationId_kind_key" ON "ContractorSubmissionSetting"("organisationId", "kind");

-- CreateIndex
CREATE INDEX "ContractorSubmission_contractId_submittedAt_idx" ON "ContractorSubmission"("contractId", "submittedAt");

-- CreateIndex
CREATE INDEX "ContractorSubmission_supplierId_idx" ON "ContractorSubmission"("supplierId");

-- CreateIndex
CREATE INDEX "ContractorSubmission_organisationId_outcome_submittedAt_idx" ON "ContractorSubmission"("organisationId", "outcome", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorSubmissionLine_submissionId_sortOrder_key" ON "ContractorSubmissionLine"("submissionId", "sortOrder");

-- CreateIndex
CREATE INDEX "Announcement_organisationId_withdrawnAt_pinned_publishedAt_idx" ON "Announcement"("organisationId", "withdrawnAt", "pinned", "publishedAt");

-- AddForeignKey
ALTER TABLE "CertificateSignature" ADD CONSTRAINT "CertificateSignature_signedBySupplierAccountId_fkey" FOREIGN KEY ("signedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_agentAttestedBySupplierAccountId_fkey" FOREIGN KEY ("agentAttestedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_disputedBySupplierAccountId_fkey" FOREIGN KEY ("disputedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmissionSetting" ADD CONSTRAINT "ContractorSubmissionSetting_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_submittedBySupplierAccountId_fkey" FOREIGN KEY ("submittedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorSubmissionLine" ADD CONSTRAINT "ContractorSubmissionLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ContractorSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_publishedByPersonId_fkey" FOREIGN KEY ("publishedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_withdrawnByPersonId_fkey" FOREIGN KEY ("withdrawnByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------------ Phase 4e, by hand (the diff above is Prisma's)

-- The staff inbox gains one kind: a contractor's submission routed to the S.O. office (6.14 OD-6, BD-614-31). The closed list is
-- STAFF_NOTICE_KINDS in src/lib/inbox/kinds.ts, and a source test holds this file to it. The CHECK is replaced whole: a kind not listed is refused as before.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION')) IS TRUE);

-- A submission is answered once, whole: the outcome, the officer, the day and the instant together or none of them. New tables hold no rows, so no pre-check.
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_answered_whole" CHECK ((("outcome" IS NULL) = ("decidedByPersonId" IS NULL) AND ("outcome" IS NULL) = ("decidedOn" IS NULL) AND ("outcome" IS NULL) = ("decidedAt" IS NULL)) IS TRUE);
-- The service level and the due day are frozen together when sent.
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_due_with_level" CHECK ((("serviceLevelDays" IS NULL) = ("dueOn" IS NULL)) IS TRUE);
-- Where it was routed is a label with its code, or neither.
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_routed_whole" CHECK ((("routedToRoleCode" IS NULL) = ("routedToRoleLabel" IS NULL)) IS TRUE);
-- A statutory declaration is signed, and nothing else carries a signature instant.
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_signed_kind" CHECK ((("kind" = 'STATUTORY_DECLARATION') = ("signedAt" IS NOT NULL)) IS TRUE);
-- An amount only on an interim claim.
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_amount_kind" CHECK (("amount" IS NULL OR "kind" = 'INTERIM_CLAIM') IS TRUE);
ALTER TABLE "ContractorSubmission" ADD CONSTRAINT "ContractorSubmission_level_positive" CHECK (("serviceLevelDays" IS NULL OR "serviceLevelDays" >= 1) IS TRUE);
ALTER TABLE "ContractorSubmissionLine" ADD CONSTRAINT "ContractorSubmissionLine_value_positive" CHECK (("value" >= 0) IS TRUE);
ALTER TABLE "ContractorSubmissionSetting" ADD CONSTRAINT "ContractorSubmissionSetting_level_positive" CHECK (("serviceLevelDays" IS NULL OR "serviceLevelDays" >= 1) IS TRUE);

-- An announcement is withdrawn whole: the instant, the officer and the reason together or none of them.
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_withdrawn_whole" CHECK ((("withdrawnAt" IS NULL) = ("withdrawnByPersonId" IS NULL) AND ("withdrawnAt" IS NOT NULL OR "withdrawReason" = '')) IS TRUE);

-- The agent's attestation signed from the portal is an attestation: the account and its instant come together, and only with the attestation day. Existing rows carry
-- neither column (both are new and null), so the constraint cannot be violated by one.
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_agent_signed_whole" CHECK ((("agentAttestedBySupplierAccountId" IS NULL) = ("agentAttestedAt" IS NULL) AND ("agentAttestedBySupplierAccountId" IS NULL OR "agentAttestedOn" IS NOT NULL)) IS TRUE);
