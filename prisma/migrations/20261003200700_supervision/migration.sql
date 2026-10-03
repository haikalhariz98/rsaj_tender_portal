-- CreateEnum
CREATE TYPE "SoAssignmentReason" AS ENUM ('EXECUTION', 'RESOLVED', 'RE_RESOLVED');

-- CreateEnum
CREATE TYPE "DelegateKind" AS ENUM ('PRINCIPAL', 'SPECIALIST', 'SPECIALIST_QS');

-- CreateEnum
CREATE TYPE "SupervisionAct" AS ENUM ('DIARY', 'PROGRAMME_SCRUTINY', 'PROGRESS', 'OBSERVATION', 'CONTRACTOR_COMMUNICATION', 'INSTRUCTION', 'VALUATION', 'VARIATION_APPLICATION');

-- CreateEnum
CREATE TYPE "ProgrammeKind" AS ENUM ('WORK_PROGRAMME', 'SERVICE_SCHEDULE');

-- CreateEnum
CREATE TYPE "ProgrammeDecision" AS ENUM ('APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "DiaryEndorser" AS ENUM ('SUPERIOR_OFFICER', 'SUPERINTENDING_OFFICER');

-- CreateEnum
CREATE TYPE "ComplianceArea" AS ENUM ('MATERIAL_QUALITY', 'WORKMANSHIP', 'AUTHORITY_COMPLIANCE', 'WORKER_WELFARE', 'SAFETY', 'INSURANCE', 'WAGES', 'OSHA');

-- CreateEnum
CREATE TYPE "DirectionCause" AS ENUM ('VARIATION', 'LOCAL_AUTHORITY_DELAY', 'OTHER_DELAY');

-- CreateEnum
CREATE TYPE "PendingDeductionKind" AS ENUM ('INSURANCE_PREMIUM');

-- CreateEnum
CREATE TYPE "EarlyActionBranch" AS ENUM ('EXTEND_TIME', 'IMPOSE_LAD', 'TERMINATE');

-- CreateEnum
CREATE TYPE "ContractPartyKind" AS ENUM ('NOMINATED_SUBCONTRACTOR', 'NOMINATED_SUPPLIER', 'ASSIGNEE');

-- CreateEnum
CREATE TYPE "SiteRecordsSet" AS ENUM ('PIPE_LOG', 'AS_BUILT');

-- CreateTable
CREATE TABLE "PostAwardPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "inDelayProgressPct" DECIMAL(9,4),
    "inDelayProvenance" "Provenance",
    "soReResolve" BOOLEAN,
    "soReResolveProvenance" "Provenance",
    "delegationLetterConventionalId" TEXT,
    "delegationNoticeConventionalId" TEXT,
    "delegationLetterDesignBuildId" TEXT,
    "delegationNoticeDesignBuildId" TEXT,
    "delegationFormsProvenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PostAwardPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSoAssignment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "reason" "SoAssignmentReason" NOT NULL,
    "matrixLabel" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleLabel" TEXT NOT NULL,
    "clause" TEXT NOT NULL,
    "contractValue" DECIMAL(18,2) NOT NULL,
    "regime" TEXT,
    "warnings" JSONB NOT NULL,
    "effectiveOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractSoAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoDelegation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "kind" "DelegateKind" NOT NULL,
    "delegatePersonId" TEXT NOT NULL,
    "delegateName" TEXT NOT NULL,
    "grantorPersonId" TEXT NOT NULL,
    "grantorName" TEXT NOT NULL,
    "competencyConfirmed" BOOLEAN NOT NULL,
    "competencyNote" TEXT NOT NULL,
    "variant" "DelegationVariant" NOT NULL,
    "letterCertificateId" TEXT NOT NULL,
    "noticeCertificateId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,
    "revokedOn" TIMESTAMP(3),
    "revokeReason" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SoDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoDelegationScope" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "delegationId" TEXT NOT NULL,
    "act" "SupervisionAct" NOT NULL,

    CONSTRAINT "SoDelegationScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Possession" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "possessionOn" TIMESTAMP(3) NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "judgedUnder" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Possession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProgramme" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" "ProgrammeKind" NOT NULL,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "directionId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "scrutinisedByPersonId" TEXT,
    "scrutinisedOn" TIMESTAMP(3),
    "reasonable" BOOLEAN,
    "scrutinyNote" TEXT NOT NULL DEFAULT '',
    "decision" "ProgrammeDecision",
    "decidedByPersonId" TEXT,
    "decidedOn" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "WorkProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammePoint" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "plannedPct" DECIMAL(9,4) NOT NULL,

    CONSTRAINT "ProgrammePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "actualPct" DECIMAL(9,4) NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDiaryEntry" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "weather" TEXT NOT NULL DEFAULT '',
    "entry" TEXT NOT NULL,
    "officerPersonId" TEXT NOT NULL,
    "officerAttestedOn" TIMESTAMP(3),
    "agentName" TEXT NOT NULL DEFAULT '',
    "agentAttestedOn" TIMESTAMP(3),
    "disagreement" TEXT NOT NULL DEFAULT '',
    "escalatedOn" TIMESTAMP(3),
    "backdatedReason" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryEndorsement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "role" "DiaryEndorser" NOT NULL,
    "personId" TEXT NOT NULL,
    "visitedOn" TIMESTAMP(3) NOT NULL,
    "coversFrom" TIMESTAMP(3) NOT NULL,
    "coversTo" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMeeting" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "chairPersonId" TEXT NOT NULL,
    "attendees" TEXT[],
    "minutes" TEXT NOT NULL,
    "inDelayReading" JSONB NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceObservation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "area" "ComplianceArea" NOT NULL,
    "observedOn" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeDirection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "cause" "DirectionCause" NOT NULL,
    "directedOn" TIMESTAMP(3) NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeDirection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingDeduction" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "PendingDeductionKind" NOT NULL,
    "policyId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "extendedTo" TIMESTAMP(3),
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarlyActionDecision" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "decidedOn" TIMESTAMP(3) NOT NULL,
    "branches" "EarlyActionBranch"[],
    "personId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarlyActionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractParty" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "ContractPartyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sum" DECIMAL(18,2),
    "directPayment" BOOLEAN,
    "provenance" "Provenance",
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "retiredOn" TIMESTAMP(3),
    "retireReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ContractParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteRecordsHandover" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "recordsSet" "SiteRecordsSet" NOT NULL,
    "handedOverOn" TIMESTAMP(3) NOT NULL,
    "toLabel" TEXT NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "pinnedVersions" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteRecordsHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostAwardPolicy_organisationId_key" ON "PostAwardPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "ContractSoAssignment_contractId_idx" ON "ContractSoAssignment"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "SoDelegation_letterCertificateId_key" ON "SoDelegation"("letterCertificateId");

-- CreateIndex
CREATE UNIQUE INDEX "SoDelegation_noticeCertificateId_key" ON "SoDelegation"("noticeCertificateId");

-- CreateIndex
CREATE INDEX "SoDelegation_contractId_idx" ON "SoDelegation"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "SoDelegationScope_delegationId_act_key" ON "SoDelegationScope"("delegationId", "act");

-- CreateIndex
CREATE UNIQUE INDEX "Possession_contractId_key" ON "Possession"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Possession_baselineId_key" ON "Possession"("baselineId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProgramme_contractId_revision_key" ON "WorkProgramme"("contractId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammePoint_programmeId_day_key" ON "ProgrammePoint"("programmeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_contractId_day_key" ON "ProgressRecord"("contractId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "SiteDiaryEntry_contractId_day_key" ON "SiteDiaryEntry"("contractId", "day");

-- AddForeignKey
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_delegationLetterConventionalId_fkey" FOREIGN KEY ("delegationLetterConventionalId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_delegationNoticeConventionalId_fkey" FOREIGN KEY ("delegationNoticeConventionalId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_delegationLetterDesignBuildId_fkey" FOREIGN KEY ("delegationLetterDesignBuildId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_delegationNoticeDesignBuildId_fkey" FOREIGN KEY ("delegationNoticeDesignBuildId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSoAssignment" ADD CONSTRAINT "ContractSoAssignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSoAssignment" ADD CONSTRAINT "ContractSoAssignment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ContractSoAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_delegatePersonId_fkey" FOREIGN KEY ("delegatePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_grantorPersonId_fkey" FOREIGN KEY ("grantorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_letterCertificateId_fkey" FOREIGN KEY ("letterCertificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_noticeCertificateId_fkey" FOREIGN KEY ("noticeCertificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegationScope" ADD CONSTRAINT "SoDelegationScope_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoDelegationScope" ADD CONSTRAINT "SoDelegationScope_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "SoDelegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Possession" ADD CONSTRAINT "Possession_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Possession" ADD CONSTRAINT "Possession_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Possession" ADD CONSTRAINT "Possession_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Possession" ADD CONSTRAINT "Possession_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ContractBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "ProgrammeDirection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_scrutinisedByPersonId_fkey" FOREIGN KEY ("scrutinisedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammePoint" ADD CONSTRAINT "ProgrammePoint_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammePoint" ADD CONSTRAINT "ProgrammePoint_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "WorkProgramme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_officerPersonId_fkey" FOREIGN KEY ("officerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEndorsement" ADD CONSTRAINT "DiaryEndorsement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEndorsement" ADD CONSTRAINT "DiaryEndorsement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEndorsement" ADD CONSTRAINT "DiaryEndorsement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeeting" ADD CONSTRAINT "SiteMeeting_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeeting" ADD CONSTRAINT "SiteMeeting_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeeting" ADD CONSTRAINT "SiteMeeting_chairPersonId_fkey" FOREIGN KEY ("chairPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceObservation" ADD CONSTRAINT "ComplianceObservation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceObservation" ADD CONSTRAINT "ComplianceObservation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceObservation" ADD CONSTRAINT "ComplianceObservation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeDirection" ADD CONSTRAINT "ProgrammeDirection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeDirection" ADD CONSTRAINT "ProgrammeDirection_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeDirection" ADD CONSTRAINT "ProgrammeDirection_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDeduction" ADD CONSTRAINT "PendingDeduction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDeduction" ADD CONSTRAINT "PendingDeduction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDeduction" ADD CONSTRAINT "PendingDeduction_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDeduction" ADD CONSTRAINT "PendingDeduction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyActionDecision" ADD CONSTRAINT "EarlyActionDecision_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyActionDecision" ADD CONSTRAINT "EarlyActionDecision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarlyActionDecision" ADD CONSTRAINT "EarlyActionDecision_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRecordsHandover" ADD CONSTRAINT "SiteRecordsHandover_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRecordsHandover" ADD CONSTRAINT "SiteRecordsHandover_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRecordsHandover" ADD CONSTRAINT "SiteRecordsHandover_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- X-6: the contract takes four more purposes (FR-SUP-006, 007, 009). The purpose-owner CHECK is rebuilt from the full list.
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
  );

-- FR-SUP-002: a delegation exists only with the S.O.'s recorded competency confirmation. A revocation has its day and moment together.
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_competency_confirmed" CHECK ("competencyConfirmed" = true AND length(trim("competencyNote")) > 0);
ALTER TABLE "SoDelegation" ADD CONSTRAINT "SoDelegation_revoked_whole" CHECK (("revokedOn" IS NULL) = ("revokedAt" IS NULL) AND ("revokedOn" IS NULL OR length(trim("revokeReason")) > 0));

-- FR-SUP-006: a programme is approved only after its scrutiny is recorded. A decision has its day.
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_approved_after_scrutiny" CHECK ("decision" IS DISTINCT FROM 'APPROVED' OR "scrutinisedOn" IS NOT NULL);
ALTER TABLE "WorkProgramme" ADD CONSTRAINT "WorkProgramme_decision_whole" CHECK (("decision" IS NULL) = ("decidedOn" IS NULL) AND ("decision" IS NULL) = ("decidedByPersonId" IS NULL));

-- FR-SUP-010: progress, planned and actual, is a percentage of the works.
ALTER TABLE "ProgrammePoint" ADD CONSTRAINT "ProgrammePoint_pct" CHECK ("plannedPct" >= 0 AND "plannedPct" <= 100);
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_pct" CHECK ("actualPct" >= 0 AND "actualPct" <= 100);
ALTER TABLE "PostAwardPolicy" ADD CONSTRAINT "PostAwardPolicy_in_delay_pct" CHECK ("inDelayProgressPct" IS NULL OR ("inDelayProgressPct" > 0 AND "inDelayProgressPct" <= 100));

-- FR-SUP-007: an entry for an earlier day than it was written carries its recorded exception.
ALTER TABLE "SiteDiaryEntry" ADD CONSTRAINT "SiteDiaryEntry_backdated_exception" CHECK ("day" >= "recordedOn" OR length(trim("backdatedReason")) > 0);

-- FR-SUP-013, B1: amounts are money owed or paid, never negative.
ALTER TABLE "PendingDeduction" ADD CONSTRAINT "PendingDeduction_amount" CHECK ("amount" > 0);
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_sum" CHECK ("sum" IS NULL OR "sum" >= 0);
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_retired_whole" CHECK ("retiredOn" IS NULL OR length(trim("retireReason")) > 0);

-- FR-SUP-015: an early-action decision takes at least one branch.
ALTER TABLE "EarlyActionDecision" ADD CONSTRAINT "EarlyActionDecision_branches" CHECK (cardinality("branches") > 0);
