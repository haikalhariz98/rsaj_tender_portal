-- CreateEnum
CREATE TYPE "OpeningKind" AS ENUM ('MAIN', 'SUPPLEMENTARY');

-- CreateEnum
CREATE TYPE "ChecklistAnswer" AS ENUM ('PRESENT', 'ABSENT', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "OpeningVerdict" AS ENUM ('PASS', 'REJECT');

-- CreateEnum
CREATE TYPE "SaleFinding" AS ENUM ('LIVE_SALE', 'NO_LIVE_SALE', 'NOT_ON_INVITEE_LIST');

-- CreateEnum
CREATE TYPE "RestrictionFinding" AS ENUM ('NOT_RESTRICTED', 'EVIDENCED', 'NOT_EVIDENCED');

-- CreateEnum
CREATE TYPE "InvitedCountReading" AS ENUM ('PURCHASERS', 'INVITEES');

-- CreateEnum
CREATE TYPE "UnpurchasedConsequence" AS ENUM ('ELIMINATE', 'REPORT');

-- CreateEnum
CREATE TYPE "CopyCheck" AS ENUM ('MATCH', 'MISMATCH', 'NOT_IN_BOX');

-- CreateEnum
CREATE TYPE "AlternativeConsideration" AS ENUM ('CONSIDERED', 'NOT_CONSIDERED');

-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "awardeePartyId" TEXT;

-- AlterTable
ALTER TABLE "BidEnvelope" ADD COLUMN     "registeredAtOpeningId" TEXT;

-- AlterTable
ALTER TABLE "BidWithdrawal" ADD COLUMN     "findingByPersonId" TEXT,
ADD COLUMN     "findingRecordedAt" TIMESTAMP(3),
ADD COLUMN     "unmatchedFinding" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Committee" ADD COLUMN     "panelExcludesUnitCode" TEXT,
ADD COLUMN     "panelExclusionProvenance" "Provenance",
ADD COLUMN     "panelExclusionRule" BOOLEAN,
ADD COLUMN     "panelSize" INTEGER,
ADD COLUMN     "panelSizeProvenance" "Provenance";

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "openingId" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "orgUnitCode" TEXT;

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "openingCommitteeCode" TEXT,
ADD COLUMN     "openingCommitteeProvenance" "Provenance",
ADD COLUMN     "unpurchasedBidConsequence" "UnpurchasedConsequence",
ADD COLUMN     "unpurchasedProvenance" "Provenance";

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "kind" "OpeningKind" NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "committeeId" TEXT NOT NULL,
    "committeeNameSnapshot" TEXT NOT NULL,
    "admissionDecisionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "startedByPersonId" TEXT NOT NULL,
    "unsealedAt" TIMESTAMP(3),
    "finalisedAt" TIMESTAMP(3),
    "boxLockedAt" TIMESTAMP(3),
    "lockGapSeconds" INTEGER,
    "panelSizeRequired" INTEGER,
    "panelOverrideAuthority" TEXT NOT NULL DEFAULT '',
    "panelOverrideReason" TEXT NOT NULL DEFAULT '',
    "panelOverrideByPersonId" TEXT,
    "estimateLead" JSONB,
    "estimatePaperAmount" DECIMAL(18,2),
    "estimateLodgedAmount" DECIMAL(18,2),
    "estimateCopyCheck" "CopyCheck",
    "checklistSnapshot" JSONB NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "minutes" TEXT NOT NULL DEFAULT '',
    "schedulePages" INTEGER,
    "scheduleSnapshot" JSONB,
    "grandSummarySnapshot" JSONB,
    "faultsSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningSitting" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "sittingNo" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "resumeReason" TEXT NOT NULL DEFAULT '',
    "adjournedAt" TIMESTAMP(3),
    "adjournReason" TEXT NOT NULL DEFAULT '',
    "recordedByPersonId" TEXT NOT NULL,

    CONSTRAINT "OpeningSitting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningPanelMember" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "committeeMemberId" TEXT,
    "seatLabelSnapshot" TEXT NOT NULL,
    "orgUnitCodeSnapshot" TEXT,
    "present" BOOLEAN NOT NULL,

    CONSTRAINT "OpeningPanelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningAuthorisation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sittingNo" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "lapsedAt" TIMESTAMP(3),

    CONSTRAINT "OpeningAuthorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenedBid" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "listingNo" INTEGER NOT NULL,
    "partyId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "bidderNameAsRead" TEXT NOT NULL,
    "registrationClassAsRead" TEXT NOT NULL DEFAULT '',
    "registrationStatusAsRead" TEXT NOT NULL DEFAULT '',
    "priceAsRead" DECIMAL(18,2) NOT NULL,
    "completionPeriod" INTEGER,
    "completionUnit" "PeriodUnit",
    "validityDaysStated" INTEGER,
    "isAlternative" BOOLEAN NOT NULL DEFAULT false,
    "parentOpenedBidId" TEXT,
    "alternativeStatus" "AlternativeConsideration",
    "saleFinding" "SaleFinding" NOT NULL,
    "restrictionFinding" "RestrictionFinding" NOT NULL,
    "completeness" JSONB,
    "verdict" "OpeningVerdict",
    "verdictReason" TEXT NOT NULL DEFAULT '',
    "verdictAt" TIMESTAMP(3),
    "asReadCorrectedAt" TIMESTAMP(3),

    CONSTRAINT "OpenedBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenedBidInitial" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openedBidId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenedBidInitial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningChecklistAnswer" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openedBidId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemLabelSnapshot" TEXT NOT NULL,
    "answer" "ChecklistAnswer" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningSignature" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "signedOn" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateCopyExplanation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateCopyExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invitedCountReading" "InvitedCountReading",
    "invitedCountProvenance" "Provenance",
    "qualifiedLabelEn" TEXT,
    "qualifiedLabelMs" TEXT,
    "notQualifiedLabelEn" TEXT,
    "notQualifiedLabelMs" TEXT,
    "lowestLabelEn" TEXT,
    "lowestLabelMs" TEXT,
    "labelsProvenance" "Provenance",
    "governingSource" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opening_admissionDecisionId_key" ON "Opening"("admissionDecisionId");

-- CreateIndex
CREATE INDEX "Opening_organisationId_idx" ON "Opening"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Opening_exerciseId_sequenceNo_key" ON "Opening"("exerciseId", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningSitting_openingId_sittingNo_key" ON "OpeningSitting"("openingId", "sittingNo");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningPanelMember_openingId_personId_key" ON "OpeningPanelMember"("openingId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningAuthorisation_openingId_sittingNo_personId_key" ON "OpeningAuthorisation"("openingId", "sittingNo", "personId");

-- CreateIndex
CREATE INDEX "OpenedBid_openingId_idx" ON "OpenedBid"("openingId");

-- CreateIndex
CREATE INDEX "OpenedBid_envelopeId_idx" ON "OpenedBid"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenedBid_exerciseId_listingNo_key" ON "OpenedBid"("exerciseId", "listingNo");

-- CreateIndex
CREATE UNIQUE INDEX "OpenedBidInitial_openedBidId_personId_key" ON "OpenedBidInitial"("openedBidId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningChecklistAnswer_openedBidId_itemKey_key" ON "OpeningChecklistAnswer"("openedBidId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningSignature_openingId_personId_key" ON "OpeningSignature"("openingId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateCopyExplanation_openingId_key" ON "EstimateCopyExplanation"("openingId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningPolicy_organisationId_key" ON "OpeningPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_openingId_idx" ON "DocumentAttachment"("openingId");

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_awardeePartyId_fkey" FOREIGN KEY ("awardeePartyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_registeredAtOpeningId_fkey" FOREIGN KEY ("registeredAtOpeningId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidWithdrawal" ADD CONSTRAINT "BidWithdrawal_findingByPersonId_fkey" FOREIGN KEY ("findingByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_admissionDecisionId_fkey" FOREIGN KEY ("admissionDecisionId") REFERENCES "CommitteeDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_startedByPersonId_fkey" FOREIGN KEY ("startedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_panelOverrideByPersonId_fkey" FOREIGN KEY ("panelOverrideByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSitting" ADD CONSTRAINT "OpeningSitting_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSitting" ADD CONSTRAINT "OpeningSitting_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSitting" ADD CONSTRAINT "OpeningSitting_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPanelMember" ADD CONSTRAINT "OpeningPanelMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPanelMember" ADD CONSTRAINT "OpeningPanelMember_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPanelMember" ADD CONSTRAINT "OpeningPanelMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPanelMember" ADD CONSTRAINT "OpeningPanelMember_committeeMemberId_fkey" FOREIGN KEY ("committeeMemberId") REFERENCES "CommitteeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningAuthorisation" ADD CONSTRAINT "OpeningAuthorisation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningAuthorisation" ADD CONSTRAINT "OpeningAuthorisation_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningAuthorisation" ADD CONSTRAINT "OpeningAuthorisation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "BidEnvelope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_parentOpenedBidId_fkey" FOREIGN KEY ("parentOpenedBidId") REFERENCES "OpenedBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBidInitial" ADD CONSTRAINT "OpenedBidInitial_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBidInitial" ADD CONSTRAINT "OpenedBidInitial_openedBidId_fkey" FOREIGN KEY ("openedBidId") REFERENCES "OpenedBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenedBidInitial" ADD CONSTRAINT "OpenedBidInitial_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningChecklistAnswer" ADD CONSTRAINT "OpeningChecklistAnswer_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningChecklistAnswer" ADD CONSTRAINT "OpeningChecklistAnswer_openedBidId_fkey" FOREIGN KEY ("openedBidId") REFERENCES "OpenedBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSignature" ADD CONSTRAINT "OpeningSignature_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSignature" ADD CONSTRAINT "OpeningSignature_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningSignature" ADD CONSTRAINT "OpeningSignature_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateCopyExplanation" ADD CONSTRAINT "EstimateCopyExplanation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateCopyExplanation" ADD CONSTRAINT "EstimateCopyExplanation_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateCopyExplanation" ADD CONSTRAINT "EstimateCopyExplanation_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningPolicy" ADD CONSTRAINT "OpeningPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the opening
-- added for its signed schedule's scan (6.7 FR-OPN-006). Prisma does not model CHECK constraints,
-- so they live here, in attachFault, and in the schema-vs-CHECK test (owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId") = 1);

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
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- 6.7 (OD-4, C-3): a bid found in the box carries no stated time and is registered at an opening,
-- on channel BOX. The 6.6 CHECK on the receipt source is rebuilt to admit it.
ALTER TABLE "BidEnvelope" DROP CONSTRAINT "BidEnvelope_entered_has_reason";
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_entered_has_reason"
  CHECK (("receivedSource" = 'ENTERED' AND "statedReceivedAt" IS NOT NULL AND length(btrim("entryReason")) > 0)
    OR ("receivedSource" = 'SERVER' AND "statedReceivedAt" IS NULL)
    OR ("receivedSource" = 'BOX_AT_OPENING' AND "statedReceivedAt" IS NULL));
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_box_at_opening"
  CHECK (("receivedSource" = 'BOX_AT_OPENING') = ("registeredAtOpeningId" IS NOT NULL)
    AND ("receivedSource" <> 'BOX_AT_OPENING' OR ("channel" = 'BOX' AND "kind" <> 'COMPANY_ESTIMATE' AND NOT "late")));

-- One main opening per exercise (OD-5: a late admission is a supplementary opening, never a second main).
CREATE UNIQUE INDEX "Opening_one_main" ON "Opening"("exerciseId") WHERE "kind" = 'MAIN';
-- A supplementary opening is opened by a carried admission, a main one by none.
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_supplementary_admission"
  CHECK (("kind" = 'SUPPLEMENTARY') = ("admissionDecisionId" IS NOT NULL));
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_sequence_positive" CHECK ("sequenceNo" >= 1);
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_pages_positive" CHECK ("schedulePages" IS NULL OR "schedulePages" >= 1);
-- C-1: the paper figure is held only with a MATCH or MISMATCH outcome, and every outcome with the lodged figure.
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_copy_check"
  CHECK (("estimateCopyCheck" IS NULL AND "estimatePaperAmount" IS NULL AND "estimateLodgedAmount" IS NULL)
    OR ("estimateCopyCheck" = 'NOT_IN_BOX' AND "estimatePaperAmount" IS NULL AND "estimateLodgedAmount" IS NOT NULL)
    OR ("estimateCopyCheck" IN ('MATCH', 'MISMATCH') AND "estimatePaperAmount" IS NOT NULL AND "estimateLodgedAmount" IS NOT NULL));
ALTER TABLE "OpeningSitting" ADD CONSTRAINT "OpeningSitting_number_positive" CHECK ("sittingNo" >= 1);

-- One offer per envelope, an alternative found inside it apart (FR-BID-006).
CREATE UNIQUE INDEX "OpenedBid_one_per_envelope" ON "OpenedBid"("envelopeId") WHERE NOT "isAlternative";
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_listing_positive" CHECK ("listingNo" >= 1);
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_price_not_negative" CHECK ("priceAsRead" >= 0);
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_period_positive" CHECK (("completionPeriod" IS NULL) = ("completionUnit" IS NULL) AND ("completionPeriod" IS NULL OR "completionPeriod" >= 1));
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_alternative_status" CHECK ("isAlternative" = ("alternativeStatus" IS NOT NULL));
ALTER TABLE "OpenedBid" ADD CONSTRAINT "OpenedBid_reject_has_reason" CHECK ("verdict" IS DISTINCT FROM 'REJECT' OR length(btrim("verdictReason")) > 0);

-- FR-OPN-002 and B7: sizes are positive where set.
ALTER TABLE "Committee" ADD CONSTRAINT "Committee_panel_size_positive" CHECK ("panelSize" IS NULL OR "panelSize" >= 1);
