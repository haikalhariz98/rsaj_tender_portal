-- CreateEnum
CREATE TYPE "EnvelopeKind" AS ENUM ('BID', 'ALTERNATIVE', 'COMPANY_ESTIMATE');

-- CreateEnum
CREATE TYPE "EnvelopeChannel" AS ENUM ('COUNTER', 'POST', 'COURIER', 'BOX');

-- CreateEnum
CREATE TYPE "ReceiptSource" AS ENUM ('SERVER', 'ENTERED');

-- CreateEnum
CREATE TYPE "EnvelopeStatus" AS ENUM ('RECEIVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BoxEventKind" AS ENUM ('LOCKED', 'UNLOCKED_FOR_OPENING');

-- AlterTable
ALTER TABLE "CommitteeDecision" ADD COLUMN     "bidEnvelopeId" TEXT;

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "bidWithdrawalId" TEXT,
ADD COLUMN     "validityExtensionId" TEXT;

-- AlterTable
ALTER TABLE "ExerciseWindow" ADD COLUMN     "alternativesPermitted" BOOLEAN,
ADD COLUMN     "bidValidityDays" INTEGER,
ADD COLUMN     "bidValidityProvenance" "Provenance";

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "completenessEliminates" BOOLEAN,
ADD COLUMN     "completenessProvenance" "Provenance",
ADD COLUMN     "lateAdmissionCommitteeCode" TEXT,
ADD COLUMN     "lateAdmissionProvenance" "Provenance",
ADD COLUMN     "minimumBids" INTEGER,
ADD COLUMN     "minimumBidsProvenance" "Provenance";

-- CreateTable
CREATE TABLE "BidEnvelope" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "EnvelopeKind" NOT NULL,
    "channel" "EnvelopeChannel" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedSource" "ReceiptSource" NOT NULL,
    "statedReceivedAt" TIMESTAMP(3),
    "entryReason" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByPersonId" TEXT NOT NULL,
    "markings" TEXT NOT NULL,
    "partyId" TEXT,
    "late" BOOLEAN NOT NULL,
    "closingAtJudged" TIMESTAMP(3),
    "recordedAfterClosing" BOOLEAN NOT NULL,
    "parentEnvelopeId" TEXT,
    "status" "EnvelopeStatus" NOT NULL DEFAULT 'RECEIVED',
    "returnedUnopenedOn" TIMESTAMP(3),
    "returnNote" TEXT NOT NULL DEFAULT '',
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidWithdrawal" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByPersonId" TEXT NOT NULL,
    "markings" TEXT NOT NULL,
    "closingAtJudged" TIMESTAMP(3) NOT NULL,
    "envelopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "kind" "BoxEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BoxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidityExtension" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "fromExpiry" TIMESTAMP(3) NOT NULL,
    "toExpiry" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "consentPartyId" TEXT NOT NULL,
    "consentReceivedOn" TIMESTAMP(3) NOT NULL,
    "recordedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidityExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidEnvelope_organisationId_idx" ON "BidEnvelope"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "BidEnvelope_exerciseId_sequence_key" ON "BidEnvelope"("exerciseId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "BidWithdrawal_envelopeId_key" ON "BidWithdrawal"("envelopeId");

-- CreateIndex
CREATE INDEX "BidWithdrawal_exerciseId_idx" ON "BidWithdrawal"("exerciseId");

-- CreateIndex
CREATE INDEX "BoxEvent_exerciseId_idx" ON "BoxEvent"("exerciseId");

-- CreateIndex
CREATE INDEX "ValidityExtension_exerciseId_idx" ON "ValidityExtension"("exerciseId");

-- CreateIndex
CREATE INDEX "CommitteeDecision_bidEnvelopeId_idx" ON "CommitteeDecision"("bidEnvelopeId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_bidWithdrawalId_idx" ON "DocumentAttachment"("bidWithdrawalId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_validityExtensionId_idx" ON "DocumentAttachment"("validityExtensionId");

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_bidEnvelopeId_fkey" FOREIGN KEY ("bidEnvelopeId") REFERENCES "BidEnvelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_bidWithdrawalId_fkey" FOREIGN KEY ("bidWithdrawalId") REFERENCES "BidWithdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_validityExtensionId_fkey" FOREIGN KEY ("validityExtensionId") REFERENCES "ValidityExtension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_receivedByPersonId_fkey" FOREIGN KEY ("receivedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_parentEnvelopeId_fkey" FOREIGN KEY ("parentEnvelopeId") REFERENCES "BidEnvelope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidWithdrawal" ADD CONSTRAINT "BidWithdrawal_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidWithdrawal" ADD CONSTRAINT "BidWithdrawal_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidWithdrawal" ADD CONSTRAINT "BidWithdrawal_receivedByPersonId_fkey" FOREIGN KEY ("receivedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidWithdrawal" ADD CONSTRAINT "BidWithdrawal_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "BidEnvelope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxEvent" ADD CONSTRAINT "BoxEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxEvent" ADD CONSTRAINT "BoxEvent_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxEvent" ADD CONSTRAINT "BoxEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidityExtension" ADD CONSTRAINT "ValidityExtension_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidityExtension" ADD CONSTRAINT "ValidityExtension_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidityExtension" ADD CONSTRAINT "ValidityExtension_consentPartyId_fkey" FOREIGN KEY ("consentPartyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidityExtension" ADD CONSTRAINT "ValidityExtension_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (X-6): the attachment owner CHECKs rebuilt from the full owner list, the bid
-- withdrawal added for its letter and the validity extension for the tenderer's consent (6.6).
-- Prisma does not model CHECK constraints, so they live here, in attachFault, and in the
-- schema-vs-CHECK test (src/lib/documents/owner-check.test.ts).
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId") = 1);

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
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
  );

-- FR-CTE-008: only a LATE_TENDER matter names an envelope. One way only, so the envelope's SET NULL
-- on delete never breaks it (an envelope is never deleted).
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_bid_envelope_late"
  CHECK ("bidEnvelopeId" IS NULL OR "matterKind" = 'LATE_TENDER');

-- A bid envelope is judged against the closing as it stood. Only a company estimate lodged in
-- preparation, before any closing was set, has none, and then it is not late.
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_closing_judged"
  CHECK ("kind" = 'COMPANY_ESTIMATE' OR "closingAtJudged" IS NOT NULL);
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_late_has_closing"
  CHECK (NOT "late" OR "closingAtJudged" IS NOT NULL);

-- OD-3 amended: an entered receipt carries the officer's stated time and the reason, a server one neither.
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_entered_has_reason"
  CHECK (("receivedSource" = 'ENTERED' AND "statedReceivedAt" IS NOT NULL AND length(btrim("entryReason")) > 0)
    OR ("receivedSource" = 'SERVER' AND "statedReceivedAt" IS NULL));

-- The estimate is never a bid: it names no bidder, has no parent envelope and is never withdrawn.
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_estimate_not_a_bid"
  CHECK ("kind" <> 'COMPANY_ESTIMATE' OR ("partyId" IS NULL AND "parentEnvelopeId" IS NULL AND "status" = 'RECEIVED'));
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_sequence_positive" CHECK ("sequence" >= 1);

-- An extension moves the expiry later, and the validity days and minimum bids are positive where set.
ALTER TABLE "ValidityExtension" ADD CONSTRAINT "ValidityExtension_later" CHECK ("toExpiry" > "fromExpiry");
ALTER TABLE "ExerciseWindow" ADD CONSTRAINT "ExerciseWindow_bid_validity_positive" CHECK ("bidValidityDays" IS NULL OR "bidValidityDays" >= 1);
ALTER TABLE "SourcingMethod" ADD CONSTRAINT "SourcingMethod_minimum_bids_positive" CHECK ("minimumBids" IS NULL OR "minimumBids" >= 1);
