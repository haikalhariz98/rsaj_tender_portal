-- Sourcing Requirements v2, wave 3b: SR-13 (ADR 0036 D1, D4, D7, rulings 12e, 19, 20i, 20o, 20v). Migration A: the pins, the mode, the switch and the part rules.
--
-- How bids are submitted (on paper, ADR 0016, or online and sealed, ADR 0036) is the customer's policy (WindowPolicy.submissionChannel, two-person path, ships unset) and is
-- pinned on each exercise when it is created (12e). The exercise's column is nullable with no default, so an exercise made while the setting is unset pins "not set", and
-- publication refuses in words. Every exercise that exists now is backfilled to its present behaviour, PAPER, so nothing in flight changes its gates. The online mode
-- (DEMONSTRATION or LIVE) is frozen on the exercise at publication beside the channel (20i), so it is not backfilled: no exercise has been published online.
--
-- The switch (BidSealingPolicy.onlineSubmission) and the recorded conditions for LIVE ship unset for every organisation: no row is written here.
-- The part rules (accepted types, the largest size, the opening check) ship unset on every part (ruling 19).

-- CreateEnum
CREATE TYPE "SubmissionChannel" AS ENUM ('PAPER', 'ONLINE');

-- CreateEnum
CREATE TYPE "OnlineSubmissionMode" AS ENUM ('DEMONSTRATION', 'LIVE');

-- AlterTable
ALTER TABLE "SecurityPolicy" ADD COLUMN     "sealingPassphraseMinLength" INTEGER;

-- AlterTable
ALTER TABLE "SourcingExercise" ADD COLUMN     "onlineBidRules" JSONB,
ADD COLUMN     "onlineSubmissionMode" "OnlineSubmissionMode",
ADD COLUMN     "publishedKeyFingerprint" TEXT,
ADD COLUMN     "submissionChannel" "SubmissionChannel";

-- AlterTable
ALTER TABLE "TenderDocumentPart" ADD COLUMN     "bidAcceptedMediaTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bidMaxBytes" BIGINT,
ADD COLUMN     "openingCheck" BOOLEAN,
ADD COLUMN     "openingCheckProvenance" "Provenance";

-- AlterTable
ALTER TABLE "WindowPolicy" ADD COLUMN     "submissionChannel" "SubmissionChannel";

-- CreateTable
CREATE TABLE "BidSealingPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "onlineSubmission" "OnlineSubmissionMode",
    "cryptoReviewReference" TEXT NOT NULL DEFAULT '',
    "cryptoReviewRecordedAt" TIMESTAMP(3),
    "procedureAmendmentReference" TEXT NOT NULL DEFAULT '',
    "procedureAmendmentRecordedAt" TIMESTAMP(3),
    "customerAcceptanceReference" TEXT NOT NULL DEFAULT '',
    "customerAcceptanceRecordedAt" TIMESTAMP(3),
    "publicRoleAttestation" TEXT NOT NULL DEFAULT '',
    "publicRoleAttestedAt" TIMESTAMP(3),
    "publicRoleAttestedByPersonId" TEXT,
    "hardeningAttestation" TEXT NOT NULL DEFAULT '',
    "hardeningAttestedAt" TIMESTAMP(3),
    "hardeningAttestedByPersonId" TEXT,
    "provenance" "Provenance",
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidSealingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BidSealingPolicy_organisationId_key" ON "BidSealingPolicy"("organisationId");

-- AddForeignKey
ALTER TABLE "BidSealingPolicy" ADD CONSTRAINT "BidSealingPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSealingPolicy" ADD CONSTRAINT "BidSealingPolicy_publicRoleAttestedByPersonId_fkey" FOREIGN KEY ("publicRoleAttestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSealingPolicy" ADD CONSTRAINT "BidSealingPolicy_hardeningAttestedByPersonId_fkey" FOREIGN KEY ("hardeningAttestedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill (12e, G1): an exercise that exists keeps its present behaviour, paper.
UPDATE "SourcingExercise" SET "submissionChannel" = 'PAPER';

-- Hand-written: the floors, in the database as well as in the code.
-- ADR 0036 D4: a passphrase of at least 12 characters, where the minimum is set at all.
ALTER TABLE "SecurityPolicy" ADD CONSTRAINT "SecurityPolicy_sealing_passphrase_floor" CHECK ("sealingPassphraseMinLength" IS NULL OR "sealingPassphraseMinLength" >= 12);
-- Ruling 19: a part's largest size, where set, is above nothing.
ALTER TABLE "TenderDocumentPart" ADD CONSTRAINT "TenderDocumentPart_bid_max_bytes_positive" CHECK ("bidMaxBytes" IS NULL OR "bidMaxBytes" > 0);
-- 20i, ADR 0036 D3, D7: the online mode, rules and fingerprint are frozen only on an online exercise.
ALTER TABLE "SourcingExercise" ADD CONSTRAINT "SourcingExercise_online_pins_only_online" CHECK (("onlineSubmissionMode" IS NULL AND "onlineBidRules" IS NULL AND "publishedKeyFingerprint" IS NULL) OR "submissionChannel" = 'ONLINE');
