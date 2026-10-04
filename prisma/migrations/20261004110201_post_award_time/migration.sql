-- 6.13 Part B run 1b (time and damages: plan B4 run 1, ADR 0029, ADR 0030): the delay notice, the EOT claim with its
-- notices and reasons, the extension of time its certificate grants, the loss-and-expense claim, the period extension
-- and its agreement, the LAD waiver. Each matter points to its ContractMatter by matterId (unique). The delay notice and
-- the EOT claim become attachment owners, and both owner CHECKs are rebuilt from the full owner list.

-- Pre-check (the SELECT CAST pattern): no attachment has a run 1b purpose yet (the values were only just added), so the
-- rebuilt purpose CHECK holds for every existing row. Fails with the message as the error, and nothing is changed.
SELECT CAST((SELECT 'Pre-check failed: an attachment already has a run 1b purpose (DELAY_NOTICE, METEOROLOGICAL_RECORD or EOT_CALCULATION), but nothing writes one before this migration. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "DocumentAttachment" WHERE "purpose" IN ('DELAY_NOTICE', 'METEOROLOGICAL_RECORD', 'EOT_CALCULATION'))) AS INTEGER);

-- CreateEnum
CREATE TYPE "DelayNoticePath" AS ENUM ('CONTRACTOR_NOTICE', 'SO_DIRECTION');

-- CreateEnum
CREATE TYPE "EotEntitlement" AS ENUM ('ENTITLED', 'NOT_ENTITLED');

-- CreateEnum
CREATE TYPE "BestEndeavours" AS ENUM ('FULL', 'PARTIAL', 'NONE');

-- CreateEnum
CREATE TYPE "FinancialImpact" AS ENUM ('NONE', 'AUTHORITY_REQUIREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReasonConcurrency" AS ENUM ('CONCURRENT', 'CONSECUTIVE');

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "delayNoticeId" TEXT,
ADD COLUMN     "eotClaimId" TEXT;

-- CreateTable
CREATE TABLE "DelayNotice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "path" "DelayNoticePath" NOT NULL,
    "cause" TEXT NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelayNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EotClaimNotice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,

    CONSTRAINT "EotClaimNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EotClaim" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "scope" "NonCompletionScope" NOT NULL,
    "sectionRef" TEXT,
    "groundClause" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "financialImpact" "FinancialImpact" NOT NULL,
    "proposedDays" INTEGER NOT NULL,
    "isWeather" BOOLEAN NOT NULL,
    "exceptional" BOOLEAN,
    "earthworksDays" INTEGER,
    "actualDelayDays" INTEGER,
    "pack" JSONB NOT NULL,
    "canComplete" BOOLEAN,
    "estimatedCompletion" TIMESTAMP(3),
    "excludedByConditionId" TEXT,
    "exclusionOverrideReason" TEXT NOT NULL DEFAULT '',
    "entitlement" "EotEntitlement",
    "entitlementReason" TEXT NOT NULL DEFAULT '',
    "bestEndeavours" "BestEndeavours",
    "determinedOn" TIMESTAMP(3),
    "determinedByPersonId" TEXT,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EotClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EotReason" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "clause" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "delayFrom" TIMESTAMP(3) NOT NULL,
    "delayUntil" TIMESTAMP(3) NOT NULL,
    "extensionDays" INTEGER NOT NULL,
    "concurrency" "ReasonConcurrency" NOT NULL,
    "group" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EotReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionOfTime" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "grantedDays" INTEGER NOT NULL,
    "computedDays" INTEGER NOT NULL,
    "previousCompletion" TIMESTAMP(3) NOT NULL,
    "newCompletion" TIMESTAMP(3) NOT NULL,
    "unextendedNote" TEXT NOT NULL DEFAULT '',
    "baselineId" TEXT,
    "insuranceOffered" JSONB NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionOfTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossExpenseClaim" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "claimId" TEXT,
    "claimed" DECIMAL(18,2) NOT NULL,
    "valued" DECIMAL(18,2),
    "basis" TEXT NOT NULL DEFAULT '',
    "valuedOn" TIMESTAMP(3),
    "valuedByPersonId" TEXT,
    "matterId" TEXT,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LossExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodExtension" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "priorAgreement" BOOLEAN NOT NULL,
    "termsRetained" BOOLEAN NOT NULL,
    "ratesRetained" BOOLEAN NOT NULL,
    "performanceSatisfactory" BOOLEAN NOT NULL,
    "spanConfirmed" BOOLEAN NOT NULL,
    "currentExpiry" TIMESTAMP(3) NOT NULL,
    "newExpiry" TIMESTAMP(3) NOT NULL,
    "financialImpact" DECIMAL(18,2),
    "reason" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodAgreement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "baselineId" TEXT,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LadWaiver" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ladAmount" DECIMAL(18,2) NOT NULL,
    "waived" DECIMAL(18,2) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "basis" JSONB NOT NULL,
    "waiverLetterRef" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "appliedOnCertificateId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LadWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DelayNotice_contractId_idx" ON "DelayNotice"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "EotClaimNotice_claimId_noticeId_key" ON "EotClaimNotice"("claimId", "noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "EotClaim_matterId_key" ON "EotClaim"("matterId");

-- CreateIndex
CREATE INDEX "EotClaim_contractId_idx" ON "EotClaim"("contractId");

-- CreateIndex
CREATE INDEX "EotReason_claimId_idx" ON "EotReason"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionOfTime_certificateId_key" ON "ExtensionOfTime"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionOfTime_baselineId_key" ON "ExtensionOfTime"("baselineId");

-- CreateIndex
CREATE INDEX "ExtensionOfTime_claimId_idx" ON "ExtensionOfTime"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "LossExpenseClaim_matterId_key" ON "LossExpenseClaim"("matterId");

-- CreateIndex
CREATE INDEX "LossExpenseClaim_contractId_idx" ON "LossExpenseClaim"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodExtension_matterId_key" ON "PeriodExtension"("matterId");

-- CreateIndex
CREATE INDEX "PeriodExtension_contractId_idx" ON "PeriodExtension"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodAgreement_certificateId_key" ON "PeriodAgreement"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodAgreement_baselineId_key" ON "PeriodAgreement"("baselineId");

-- CreateIndex
CREATE INDEX "PeriodAgreement_extensionId_idx" ON "PeriodAgreement"("extensionId");

-- CreateIndex
CREATE UNIQUE INDEX "LadWaiver_matterId_key" ON "LadWaiver"("matterId");

-- CreateIndex
CREATE UNIQUE INDEX "LadWaiver_appliedOnCertificateId_key" ON "LadWaiver"("appliedOnCertificateId");

-- CreateIndex
CREATE INDEX "LadWaiver_decisionId_idx" ON "LadWaiver"("decisionId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_delayNoticeId_idx" ON "DocumentAttachment"("delayNoticeId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_eotClaimId_idx" ON "DocumentAttachment"("eotClaimId");

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_delayNoticeId_fkey" FOREIGN KEY ("delayNoticeId") REFERENCES "DelayNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_eotClaimId_fkey" FOREIGN KEY ("eotClaimId") REFERENCES "EotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayNotice" ADD CONSTRAINT "DelayNotice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayNotice" ADD CONSTRAINT "DelayNotice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelayNotice" ADD CONSTRAINT "DelayNotice_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaimNotice" ADD CONSTRAINT "EotClaimNotice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaimNotice" ADD CONSTRAINT "EotClaimNotice_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "EotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaimNotice" ADD CONSTRAINT "EotClaimNotice_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "DelayNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "ContractMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "WorkProgramme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_excludedByConditionId_fkey" FOREIGN KEY ("excludedByConditionId") REFERENCES "AwardCondition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_determinedByPersonId_fkey" FOREIGN KEY ("determinedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotReason" ADD CONSTRAINT "EotReason_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EotReason" ADD CONSTRAINT "EotReason_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "EotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionOfTime" ADD CONSTRAINT "ExtensionOfTime_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionOfTime" ADD CONSTRAINT "ExtensionOfTime_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionOfTime" ADD CONSTRAINT "ExtensionOfTime_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "EotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionOfTime" ADD CONSTRAINT "ExtensionOfTime_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ContractBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionOfTime" ADD CONSTRAINT "ExtensionOfTime_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "EotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_valuedByPersonId_fkey" FOREIGN KEY ("valuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "ContractMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodExtension" ADD CONSTRAINT "PeriodExtension_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodExtension" ADD CONSTRAINT "PeriodExtension_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "ContractMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodExtension" ADD CONSTRAINT "PeriodExtension_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodExtension" ADD CONSTRAINT "PeriodExtension_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodAgreement" ADD CONSTRAINT "PeriodAgreement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodAgreement" ADD CONSTRAINT "PeriodAgreement_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodAgreement" ADD CONSTRAINT "PeriodAgreement_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "PeriodExtension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodAgreement" ADD CONSTRAINT "PeriodAgreement_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ContractBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodAgreement" ADD CONSTRAINT "PeriodAgreement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWaiver" ADD CONSTRAINT "LadWaiver_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWaiver" ADD CONSTRAINT "LadWaiver_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "ContractMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWaiver" ADD CONSTRAINT "LadWaiver_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "NonCompletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWaiver" ADD CONSTRAINT "LadWaiver_appliedOnCertificateId_fkey" FOREIGN KEY ("appliedOnCertificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadWaiver" ADD CONSTRAINT "LadWaiver_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A claim's scope names a section exactly when it is a section's. A weather claim, once determined, says whether the
-- weather was exceptional. A claim not entitled says why. No day count is below nothing.
ALTER TABLE "EotClaim" ADD CONSTRAINT "EotClaim_shape"
  CHECK ((("scope" = 'SECTION') = ("sectionRef" IS NOT NULL))
    AND (NOT "isWeather" OR "entitlement" IS NULL OR "exceptional" IS NOT NULL)
    AND ("entitlement" IS DISTINCT FROM 'NOT_ENTITLED' OR length(btrim("entitlementReason")) > 0)
    AND ("proposedDays" >= 0) AND ("earthworksDays" IS NULL OR "earthworksDays" >= 0) AND ("actualDelayDays" IS NULL OR "actualDelayDays" >= 0));

-- A reason's delay ends after it begins (the end day exclusive), its extension is never below nothing, and a concurrent
-- reason names its group (a consecutive one none).
ALTER TABLE "EotReason" ADD CONSTRAINT "EotReason_shape"
  CHECK ("delayUntil" > "delayFrom" AND "extensionDays" >= 0 AND (("concurrency" = 'CONCURRENT') = ("group" IS NOT NULL)));

-- An extension grants days and moves the date for completion later.
ALTER TABLE "ExtensionOfTime" ADD CONSTRAINT "ExtensionOfTime_shape"
  CHECK ("grantedDays" > 0 AND "computedDays" >= 0 AND "newCompletion" > "previousCompletion");

-- Claimed and valued are never below nothing, and a valuation says when.
ALTER TABLE "LossExpenseClaim" ADD CONSTRAINT "LossExpenseClaim_shape"
  CHECK ("claimed" >= 0 AND ("valued" IS NULL OR "valued" >= 0) AND (("valued" IS NULL) = ("valuedOn" IS NULL)));

-- The new expiry is after the current one, and a financial impact is never below nothing.
ALTER TABLE "PeriodExtension" ADD CONSTRAINT "PeriodExtension_shape"
  CHECK ("newExpiry" > "currentExpiry" AND ("financialImpact" IS NULL OR "financialImpact" >= 0));

-- A waiver waives something, never more than the LAD amount, and is applied with its day.
ALTER TABLE "LadWaiver" ADD CONSTRAINT "LadWaiver_shape"
  CHECK ("ladAmount" > 0 AND "waived" > 0 AND "waived" <= "ladAmount" AND (("appliedOnCertificateId" IS NULL) = ("appliedAt" IS NULL)));

-- Attachment owners: both CHECKs rebuilt from the full owner list (Part A S-2 precedent).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId") = 1);

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
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
    OR ("purpose" IN ('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO') AND "contractId" IS NOT NULL)
    OR ("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL)
    OR ("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL)
    OR ("purpose" = 'DELAY_NOTICE' AND "delayNoticeId" IS NOT NULL)
    OR ("purpose" IN ('METEOROLOGICAL_RECORD', 'EOT_CALCULATION') AND "eotClaimId" IS NOT NULL)
  );
