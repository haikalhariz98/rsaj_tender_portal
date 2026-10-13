-- Sourcing Requirements v2, wave 3b: SR-13 (ADR 0036 D3, D5, D7, D10, D11, D12, rulings 20a to 20w). Migration B: the sealed tables, their triggers, and the
-- nullable columns that online bids need on the paper register.
--
-- The new enum values (EnvelopeChannel ONLINE, ReceiptSource PORTAL, EnvelopeStatus SUPERSEDED, ConfigurationChangeKind BID_SEALING_POLICY) are each their own
-- migration, before this one, so the CHECKs and triggers below may name them.
-- The new tables are empty. The existing envelopes are all paper and keep their receiving officer, and every existing opened bid keeps its price, so every CHECK
-- below holds for the rows that exist. The app's login loses DELETE and TRUNCATE on the sealed tables, and UPDATE as well on the two append-only ones, when
-- `npm run db:roles` next runs (SEALED_TABLES and APPEND_ONLY_TABLES in src/lib/auth/db-role.ts).

-- CreateEnum
CREATE TYPE "OnlineBidKind" AS ENUM ('BID', 'ALTERNATIVE');

-- CreateEnum
CREATE TYPE "OnlineBidStatus" AS ENUM ('SUBMITTED', 'REPLACED', 'WITHDRAWN', 'OPENED');

-- CreateEnum
CREATE TYPE "OnlineBidFileState" AS ENUM ('DRAFT', 'SUBMITTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ShareReleasePurpose" AS ENUM ('UNSEAL', 'SUBSTITUTION');

-- CreateEnum
CREATE TYPE "GrantUse" AS ENUM ('OPENING_CHECK', 'FINALISE');

-- CreateEnum
CREATE TYPE "GrantSubject" AS ENUM ('FILE', 'DECLARATION', 'ESTIMATE');

-- CreateEnum
CREATE TYPE "StoredScan" AS ENUM ('CLEAN', 'NOT_SCANNED');

-- CreateEnum
CREATE TYPE "SealedAccessKind" AS ENUM ('SHARE_SET', 'UNLOCK_CHECK', 'KEY_CREATED', 'KEY_RETIRED', 'PART_UPLOAD', 'PART_DISCARD', 'SUBMIT', 'WITHDRAW', 'AUTHORISE', 'DOWNLOAD', 'FINALISE', 'SUBSTITUTION_RELEASE', 'ESTIMATE_LODGED');

-- CreateEnum
CREATE TYPE "SealedAccessOutcome" AS ENUM ('GRANTED', 'REFUSED');

-- AlterTable
ALTER TABLE "BidEnvelope" ALTER COLUMN "receivedByPersonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OpenedBid" ALTER COLUMN "priceAsRead" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Opening" ADD COLUMN     "receiptRoll" JSONB;

-- CreateTable
CREATE TABLE "OfficerExerciseKey" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "openingOfficerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "wrappedPrivateKey" BYTEA NOT NULL,
    "kdfLog2N" INTEGER NOT NULL,
    "kdfR" INTEGER NOT NULL,
    "kdfP" INTEGER NOT NULL,
    "kdfSalt" BYTEA NOT NULL,
    "pepperId" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "OfficerExerciseKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSealingKey" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "officerCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExerciseSealingKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedKeyChange" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "fromKeyId" TEXT NOT NULL,
    "toKeyId" TEXT NOT NULL,
    "fromFingerprint" TEXT NOT NULL,
    "toFingerprint" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "byPersonId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedKeyChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseKeyShare" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "openingOfficerId" TEXT NOT NULL,
    "officerKeyId" TEXT NOT NULL,
    "sealedShare" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExerciseKeyShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareRelease" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "purpose" "ShareReleasePurpose" NOT NULL,
    "openingId" TEXT,
    "authorisationId" TEXT,
    "substitutionOfficerId" TEXT,
    "fromOfficerKeyId" TEXT NOT NULL,
    "toOfficerKeyId" TEXT NOT NULL,
    "sealedShares" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "lapsedAt" TIMESTAMP(3),

    CONSTRAINT "ShareRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineBidFile" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "uploadedBySupplierAccountId" TEXT NOT NULL,
    "packPartId" TEXT NOT NULL,
    "cipherSha256" CHAR(64) NOT NULL,
    "cipherBytes" BIGINT NOT NULL,
    "sealedDek" BYTEA NOT NULL,
    "sealedMeta" BYTEA NOT NULL,
    "bodyIv" BYTEA NOT NULL,
    "releasedDek" BYTEA,
    "scan" "StoredScan" NOT NULL,
    "state" "OnlineBidFileState" NOT NULL DEFAULT 'DRAFT',
    "uploadedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineBidFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineBid" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "submittedBySupplierAccountId" TEXT NOT NULL,
    "kind" "OnlineBidKind" NOT NULL,
    "parentOnlineBidId" TEXT,
    "replacesOnlineBidId" TEXT,
    "status" "OnlineBidStatus" NOT NULL DEFAULT 'SUBMITTED',
    "statusAt" TIMESTAMP(3),
    "sealedManifest" BYTEA NOT NULL,
    "manifestDek" BYTEA NOT NULL,
    "manifestCipherSha256" TEXT NOT NULL,
    "sealedDeclaration" BYTEA NOT NULL,
    "declarationDek" BYTEA NOT NULL,
    "declarationCipherSha256" TEXT NOT NULL,
    "receiptDigest" TEXT NOT NULL,

    CONSTRAINT "OnlineBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineBidPart" (
    "organisationId" TEXT NOT NULL,
    "onlineBidId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "OnlineBidPart_pkey" PRIMARY KEY ("onlineBidId","fileId")
);

-- CreateTable
CREATE TABLE "OfficerDekGrant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "officerKeyId" TEXT NOT NULL,
    "subject" "GrantSubject" NOT NULL,
    "recordId" TEXT NOT NULL,
    "use" "GrantUse" NOT NULL,
    "sealedDek" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficerDekGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SealedEstimateLodgement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sealedEstimate" BYTEA NOT NULL,
    "estimateDek" BYTEA NOT NULL,
    "cipherSha256" TEXT NOT NULL,
    "lodgedAt" TIMESTAMP(3) NOT NULL,
    "lodgedByPersonId" TEXT NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "supersededReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SealedEstimateLodgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SealedAccessEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "kind" "SealedAccessKind" NOT NULL,
    "outcome" "SealedAccessOutcome" NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "staffPersonId" TEXT,
    "supplierAccountId" TEXT,
    "sessionId" TEXT,
    "sourceAddress" TEXT,
    "recordId" TEXT,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SealedAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficerExerciseKey_exerciseId_idx" ON "OfficerExerciseKey"("exerciseId");

-- CreateIndex
CREATE INDEX "OfficerExerciseKey_openingOfficerId_idx" ON "OfficerExerciseKey"("openingOfficerId");

-- CreateIndex
CREATE INDEX "OfficerExerciseKey_personId_idx" ON "OfficerExerciseKey"("personId");

-- CreateIndex
CREATE INDEX "ExerciseSealingKey_exerciseId_idx" ON "ExerciseSealingKey"("exerciseId");

-- CreateIndex
CREATE INDEX "PublishedKeyChange_exerciseId_at_idx" ON "PublishedKeyChange"("exerciseId", "at");

-- CreateIndex
CREATE INDEX "ExerciseKeyShare_keyId_idx" ON "ExerciseKeyShare"("keyId");

-- CreateIndex
CREATE INDEX "ExerciseKeyShare_officerKeyId_idx" ON "ExerciseKeyShare"("officerKeyId");

-- CreateIndex
CREATE INDEX "ShareRelease_keyId_idx" ON "ShareRelease"("keyId");

-- CreateIndex
CREATE INDEX "ShareRelease_openingId_idx" ON "ShareRelease"("openingId");

-- CreateIndex
CREATE INDEX "ShareRelease_toOfficerKeyId_idx" ON "ShareRelease"("toOfficerKeyId");

-- CreateIndex
CREATE INDEX "OnlineBidFile_exerciseId_supplierId_idx" ON "OnlineBidFile"("exerciseId", "supplierId");

-- CreateIndex
CREATE INDEX "OnlineBidFile_keyId_idx" ON "OnlineBidFile"("keyId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineBid_envelopeId_key" ON "OnlineBid"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineBid_replacesOnlineBidId_key" ON "OnlineBid"("replacesOnlineBidId");

-- CreateIndex
CREATE INDEX "OnlineBid_exerciseId_supplierId_idx" ON "OnlineBid"("exerciseId", "supplierId");

-- CreateIndex
CREATE INDEX "OnlineBid_keyId_idx" ON "OnlineBid"("keyId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineBidPart_fileId_key" ON "OnlineBidPart"("fileId");

-- CreateIndex
CREATE INDEX "OfficerDekGrant_officerKeyId_idx" ON "OfficerDekGrant"("officerKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficerDekGrant_openingId_officerKeyId_subject_recordId_key" ON "OfficerDekGrant"("openingId", "officerKeyId", "subject", "recordId");

-- CreateIndex
CREATE INDEX "SealedEstimateLodgement_exerciseId_idx" ON "SealedEstimateLodgement"("exerciseId");

-- CreateIndex
CREATE INDEX "SealedAccessEvent_exerciseId_at_idx" ON "SealedAccessEvent"("exerciseId", "at");

-- CreateIndex
CREATE INDEX "SealedAccessEvent_organisationId_at_idx" ON "SealedAccessEvent"("organisationId", "at");

-- AddForeignKey
ALTER TABLE "OfficerExerciseKey" ADD CONSTRAINT "OfficerExerciseKey_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerExerciseKey" ADD CONSTRAINT "OfficerExerciseKey_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerExerciseKey" ADD CONSTRAINT "OfficerExerciseKey_openingOfficerId_fkey" FOREIGN KEY ("openingOfficerId") REFERENCES "ExerciseOpeningOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerExerciseKey" ADD CONSTRAINT "OfficerExerciseKey_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSealingKey" ADD CONSTRAINT "ExerciseSealingKey_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSealingKey" ADD CONSTRAINT "ExerciseSealingKey_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_fromKeyId_fkey" FOREIGN KEY ("fromKeyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_toKeyId_fkey" FOREIGN KEY ("toKeyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_byPersonId_fkey" FOREIGN KEY ("byPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseKeyShare" ADD CONSTRAINT "ExerciseKeyShare_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseKeyShare" ADD CONSTRAINT "ExerciseKeyShare_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseKeyShare" ADD CONSTRAINT "ExerciseKeyShare_openingOfficerId_fkey" FOREIGN KEY ("openingOfficerId") REFERENCES "ExerciseOpeningOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseKeyShare" ADD CONSTRAINT "ExerciseKeyShare_officerKeyId_fkey" FOREIGN KEY ("officerKeyId") REFERENCES "OfficerExerciseKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_authorisationId_fkey" FOREIGN KEY ("authorisationId") REFERENCES "OpeningAuthorisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_substitutionOfficerId_fkey" FOREIGN KEY ("substitutionOfficerId") REFERENCES "ExerciseOpeningOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_fromOfficerKeyId_fkey" FOREIGN KEY ("fromOfficerKeyId") REFERENCES "OfficerExerciseKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_toOfficerKeyId_fkey" FOREIGN KEY ("toOfficerKeyId") REFERENCES "OfficerExerciseKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_uploadedBySupplierAccountId_fkey" FOREIGN KEY ("uploadedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_packPartId_fkey" FOREIGN KEY ("packPartId") REFERENCES "TenderPackPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_organisationId_cipherSha256_fkey" FOREIGN KEY ("organisationId", "cipherSha256") REFERENCES "BlobContent"("organisationId", "sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "BidEnvelope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_submittedBySupplierAccountId_fkey" FOREIGN KEY ("submittedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_parentOnlineBidId_fkey" FOREIGN KEY ("parentOnlineBidId") REFERENCES "OnlineBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_replacesOnlineBidId_fkey" FOREIGN KEY ("replacesOnlineBidId") REFERENCES "OnlineBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidPart" ADD CONSTRAINT "OnlineBidPart_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidPart" ADD CONSTRAINT "OnlineBidPart_onlineBidId_fkey" FOREIGN KEY ("onlineBidId") REFERENCES "OnlineBid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineBidPart" ADD CONSTRAINT "OnlineBidPart_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "OnlineBidFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerDekGrant" ADD CONSTRAINT "OfficerDekGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerDekGrant" ADD CONSTRAINT "OfficerDekGrant_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerDekGrant" ADD CONSTRAINT "OfficerDekGrant_officerKeyId_fkey" FOREIGN KEY ("officerKeyId") REFERENCES "OfficerExerciseKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ExerciseSealingKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "CompanyEstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_lodgedByPersonId_fkey" FOREIGN KEY ("lodgedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedAccessEvent" ADD CONSTRAINT "SealedAccessEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedAccessEvent" ADD CONSTRAINT "SealedAccessEvent_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedAccessEvent" ADD CONSTRAINT "SealedAccessEvent_staffPersonId_fkey" FOREIGN KEY ("staffPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedAccessEvent" ADD CONSTRAINT "SealedAccessEvent_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ================================================================== hand-written: wave 3b, the sealed register's rules (ADR 0036 D12)
--
-- Every function refuses whoever runs it, the table owner and a superuser included, and every trigger is ENABLE ALWAYS so it keeps firing under
-- session_replication_role = replica. Each refusal carries its own SQLSTATE (PA010 to PA029 are reserved for wave 3b):
--   PA010  an ONLINE envelope's stamp: whole seconds, within MAX_STAMP_SKEW_SECONDS of the database clock, on an ONLINE exercise with its closing set (trigger 1)
--   PA011  the online register is the opening's: no ONLINE envelope once the main opening exists (trigger 1)
--   PA012  a status moves forward only, judged by the act's own stamp, and an ONLINE envelope's stamp and facts never change (trigger 2)
--   PA013  a submission is written whole: its envelope and its parts in its own transaction, under the live key (trigger 3)
--   PA014  ciphertext and key material never change, and a shred goes from set to NULL only (trigger 4)
--   PA015  a released data key is written only while its opening is finalising (trigger 5)
--   PA016  an alternative's parent moves only with its parent's replacement or withdrawal (trigger 6)
--   PA017  the exercise key and the published fingerprint (trigger 7)
--   PA018  LODGEMENT_CLOSED: the sealed estimate is not lodged or superseded after the closing (trigger 8)
--   PA019  a wrap without a pepper only on a DEMONSTRATION exercise (trigger 9)
--   PA020  no DELETE and no TRUNCATE on the sealed tables (trigger 10)
--   PA021  an opening is not finalised while any of its bids has no price, and a paper bid always has one
--   PA022  an online bid is opened only by the unseal being written
--   PA023  the online mode frozen at publication never changes (20i: a demonstration is never promoted to a real one)
--   PA024  a bid file is uploaded as a draft, under the exercise's live key
-- MAX_STAMP_SKEW_SECONDS is the product constant in src/lib/portal/bids/limits.ts, written here as the literal 30. A test pins the two equal.
-- The xmin of a row equals pg_current_xact_id()::xid exactly when this transaction wrote that row version: that is how "in the same transaction" is read.

-- ------------------------------------------------------------------ CHECKs

-- ADR 0036 D12: an ONLINE envelope names no receiving officer, is stamped by the portal, is a bid or an alternative, and names its parent on OnlineBid, never here.
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_online_no_receiver" CHECK (("channel" = 'ONLINE') = ("receivedByPersonId" IS NULL));
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_online_portal" CHECK (("channel" = 'ONLINE') = ("receivedSource" = 'PORTAL'));
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_online_kind" CHECK ("channel" <> 'ONLINE' OR ("kind" IN ('BID', 'ALTERNATIVE') AND "parentEnvelopeId" IS NULL AND "registeredAtOpeningId" IS NULL));
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_superseded_online" CHECK ("status" <> 'SUPERSEDED' OR "channel" = 'ONLINE');
-- The 6.7 CHECK on the receipt source is rebuilt to admit the portal's stamp, which carries no stated time.
ALTER TABLE "BidEnvelope" DROP CONSTRAINT "BidEnvelope_entered_has_reason";
ALTER TABLE "BidEnvelope" ADD CONSTRAINT "BidEnvelope_entered_has_reason"
  CHECK (("receivedSource" = 'ENTERED' AND "statedReceivedAt" IS NOT NULL AND length(btrim("entryReason")) > 0)
    OR ("receivedSource" = 'SERVER' AND "statedReceivedAt" IS NULL)
    OR ("receivedSource" = 'BOX_AT_OPENING' AND "statedReceivedAt" IS NULL)
    OR ("receivedSource" = 'PORTAL' AND "statedReceivedAt" IS NULL));

ALTER TABLE "OfficerExerciseKey" ADD CONSTRAINT "OfficerExerciseKey_material" CHECK (octet_length("publicKey") = 32 AND octet_length("kdfSalt") = 16 AND "kdfLog2N" >= 1 AND "kdfR" >= 1 AND "kdfP" >= 1 AND "failedAttempts" >= 0);
ALTER TABLE "OfficerExerciseKey" ADD CONSTRAINT "OfficerExerciseKey_retired_reason" CHECK ("retiredAt" IS NULL OR length(btrim("retiredReason")) > 0);
ALTER TABLE "ExerciseSealingKey" ADD CONSTRAINT "ExerciseSealingKey_material" CHECK (octet_length("publicKey") = 32 AND "officerCount" >= 2 AND "fingerprint" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ExerciseSealingKey" ADD CONSTRAINT "ExerciseSealingKey_retired_reason" CHECK ("retiredAt" IS NULL OR length(btrim("retiredReason")) > 0);
ALTER TABLE "PublishedKeyChange" ADD CONSTRAINT "PublishedKeyChange_reason" CHECK (length(btrim("reason")) > 0 AND "fromKeyId" <> "toKeyId");
-- A shredded share is an ended one.
ALTER TABLE "ExerciseKeyShare" ADD CONSTRAINT "ExerciseKeyShare_shred_ends" CHECK ("sealedShare" IS NOT NULL OR "endedAt" IS NOT NULL);
-- An unseal release belongs to an opening's authorisation, a substitution release to the incoming officer's roster row. A shredded release is used or lapsed.
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_purpose" CHECK (
  ("purpose" = 'UNSEAL' AND "openingId" IS NOT NULL AND "authorisationId" IS NOT NULL AND "substitutionOfficerId" IS NULL)
  OR ("purpose" = 'SUBSTITUTION' AND "openingId" IS NULL AND "authorisationId" IS NULL AND "substitutionOfficerId" IS NOT NULL));
ALTER TABLE "ShareRelease" ADD CONSTRAINT "ShareRelease_shred_ends" CHECK ("sealedShares" IS NOT NULL OR "usedAt" IS NOT NULL OR "lapsedAt" IS NOT NULL);
ALTER TABLE "OnlineBidFile" ADD CONSTRAINT "OnlineBidFile_material" CHECK (octet_length("bodyIv") = 12 AND "cipherBytes" > 0 AND "cipherSha256" ~ '^[0-9a-f]{64}$');
-- A bid names no parent (only an alternative does), and nothing is its own parent or its own replacement. A replaced or withdrawn bid carries its stamp.
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_parent" CHECK (("kind" = 'ALTERNATIVE' OR "parentOnlineBidId" IS NULL) AND "parentOnlineBidId" IS DISTINCT FROM "id" AND "replacesOnlineBidId" IS DISTINCT FROM "id");
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_status_stamp" CHECK ("status" NOT IN ('REPLACED', 'WITHDRAWN') OR "statusAt" IS NOT NULL);
ALTER TABLE "OnlineBid" ADD CONSTRAINT "OnlineBid_digests" CHECK ("manifestCipherSha256" ~ '^[0-9a-f]{64}$' AND "declarationCipherSha256" ~ '^[0-9a-f]{64}$' AND "receiptDigest" ~ '^[0-9a-f]{64}$');
-- A declaration and an estimate are used only to finalise (H3 a): only a file can be an opening-check grant.
ALTER TABLE "OfficerDekGrant" ADD CONSTRAINT "OfficerDekGrant_use" CHECK ("subject" = 'FILE' OR "use" = 'FINALISE');
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_superseded_reason" CHECK ("supersededAt" IS NULL OR length(btrim("supersededReason")) > 0);
ALTER TABLE "SealedEstimateLodgement" ADD CONSTRAINT "SealedEstimateLodgement_digest" CHECK ("cipherSha256" ~ '^[0-9a-f]{64}$');

-- One live officer key per roster row, and one live exercise key per exercise (ADR 0036 D3).
CREATE UNIQUE INDEX "OfficerExerciseKey_one_live" ON "OfficerExerciseKey"("openingOfficerId") WHERE "retiredAt" IS NULL;
CREATE UNIQUE INDEX "ExerciseSealingKey_one_live" ON "ExerciseSealingKey"("exerciseId") WHERE "retiredAt" IS NULL;

-- ------------------------------------------------------------------ helpers

-- The row as it was and as it will be, apart from the columns that may change: equal when nothing else changed.
CREATE FUNCTION "sealed_unchanged"(old_row jsonb, new_row jsonb, mutable text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (old_row - mutable) = (new_row - mutable)
$$;

-- The database clock, as the UTC wall time the application's DateTime columns hold.
CREATE FUNCTION "sealed_clock"() RETURNS timestamp LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'UTC')::timestamp
$$;

-- ------------------------------------------------------------------ trigger 1: the stamp on an ONLINE envelope (H2)

CREATE FUNCTION "sealed_envelope_stamp"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  clock timestamp := "sealed_clock"();
  closing timestamp;
  channel_pin text;
BEGIN
  IF NEW."channel" <> 'ONLINE' THEN
    RETURN NEW;
  END IF;
  IF NEW."receivedAt" <> date_trunc('second', NEW."receivedAt") OR NEW."receivedAt" > clock OR NEW."receivedAt" < clock - make_interval(secs => 30) THEN
    RAISE EXCEPTION 'INSERT of an ONLINE envelope is refused: its stamp % is not a whole second within 30 seconds before the database clock %', NEW."receivedAt", clock
      USING ERRCODE = 'PA010', HINT = 'ADR 0036 D5, H2, S24. The submission takes its stamp from the database clock, to the second, and inserts within the skew.';
  END IF;
  SELECT e."closingAt", e."submissionChannel"::text INTO closing, channel_pin FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF channel_pin IS DISTINCT FROM 'ONLINE' OR closing IS NULL THEN
    RAISE EXCEPTION 'INSERT of an ONLINE envelope is refused: the exercise is not pinned ONLINE, or has no closing'
      USING ERRCODE = 'PA010', HINT = 'ADR 0036 D1. An online submission is taken only on an exercise pinned ONLINE, judged against its closing.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Opening" o WHERE o."exerciseId" = NEW."exerciseId" AND o."kind" = 'MAIN') THEN
    RAISE EXCEPTION 'INSERT of an ONLINE envelope is refused: the main opening has started, and the register is now the opening''s'
      USING ERRCODE = 'PA011', HINT = 'ADR 0036 D7, ruling 20b. Late submissions are taken until the main opening is started.';
  END IF;
  -- The trigger owns the closing judged and the late flag: whatever the writer sent is overwritten.
  NEW."closingAtJudged" := closing;
  NEW."late" := NEW."receivedAt" > closing;
  NEW."recordedAfterClosing" := NEW."late";
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ trigger 2: status moves, forward only, judged by the act's own stamp

CREATE FUNCTION "sealed_envelope_move"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bid_status text;
BEGIN
  IF OLD."channel" <> 'ONLINE' AND NEW."channel" <> 'ONLINE' THEN
    RETURN NEW;
  END IF;
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'partyId']) THEN
    RAISE EXCEPTION 'UPDATE of an ONLINE envelope is refused: its channel, stamp, sequence, late flag and closing judged are the database''s and never change'
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D12, H2. Only its status moves, with its submission''s, and its party is named at the unseal.';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    SELECT b."status"::text INTO bid_status FROM "OnlineBid" b WHERE b."envelopeId" = NEW."id";
    IF OLD."status" <> 'RECEIVED'
       OR NOT ((NEW."status" = 'SUPERSEDED' AND bid_status = 'REPLACED') OR (NEW."status" = 'WITHDRAWN' AND bid_status = 'WITHDRAWN') OR (NEW."status" = 'OPENED' AND bid_status = 'OPENED')) THEN
      RAISE EXCEPTION 'UPDATE of an ONLINE envelope from % to % is refused: it moves forward only, and only with its submission (now %)', OLD."status", NEW."status", coalesce(bid_status, 'none')
        USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7. The submission moves first, judged by its own stamp; the envelope follows it.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ triggers 2 to 6 on OnlineBid: what may change, how its status and its parent move

CREATE FUNCTION "sealed_online_bid_change"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  clock timestamp := "sealed_clock"();
  closing timestamp;
  replacement_stamp timestamp;
  old_parent_status text;
  old_parent_mine boolean;
BEGIN
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'statusAt', 'parentOnlineBidId']) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: a submission''s ciphertext, digests, keys and identity never change', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D12, S8. Ciphertext is immutable.';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'UPDATE of "OnlineBid" % from % to % is refused: a status moves forward only', OLD."id", OLD."status", NEW."status"
        USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, S12. A replaced, withdrawn or opened submission never moves again.';
    END IF;
    SELECT e."closingAt" INTO closing FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId";
    IF NEW."status" = 'REPLACED' THEN
      -- Judged by the replacement's own stamp: its envelope, inserted in this transaction and bounded by trigger 1, is in time.
      SELECT ne."receivedAt" INTO replacement_stamp
        FROM "OnlineBid" r JOIN "BidEnvelope" ne ON ne."id" = r."envelopeId"
        WHERE r."replacesOnlineBidId" = OLD."id" AND ne."xmin" = pg_current_xact_id()::xid AND NOT ne."late" AND ne."receivedAt" <= closing;
      IF replacement_stamp IS NULL OR NEW."statusAt" IS DISTINCT FROM replacement_stamp THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to REPLACED is refused: no in-time replacement was submitted in this transaction, or the stamp is not the replacement''s', OLD."id"
          USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, FR-BID-002. A replace is allowed up to and including the closing second, judged by the replacement''s stamp.';
      END IF;
    ELSIF NEW."status" = 'WITHDRAWN' THEN
      IF NEW."statusAt" IS NULL OR NEW."statusAt" <> date_trunc('second', NEW."statusAt") OR NEW."statusAt" > clock OR NEW."statusAt" < clock - make_interval(secs => 30) OR closing IS NULL OR NEW."statusAt" > closing THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to WITHDRAWN is refused: the withdrawal''s stamp % is not a whole second within 30 seconds before the database clock, at or before the closing', OLD."id", NEW."statusAt"
          USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, FR-BID-004. A withdrawal is allowed up to and including the closing second, judged by its own stamp.';
      END IF;
    ELSIF NEW."status" = 'OPENED' THEN
      IF NOT EXISTS (SELECT 1 FROM "Opening" o WHERE o."exerciseId" = NEW."exerciseId" AND o."unsealedAt" IS NOT NULL AND o."finalisedAt" IS NULL AND o."xmin" = pg_current_xact_id()::xid) THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to OPENED is refused: no unseal of this exercise''s opening is being written in this transaction', OLD."id"
          USING ERRCODE = 'PA022', HINT = 'ADR 0036 D10. Only the last authorisation of the unseal opens a submission.';
      END IF;
    END IF;
  ELSIF NEW."statusAt" IS DISTINCT FROM OLD."statusAt" THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: a status stamp changes only with its status', OLD."id"
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7.';
  END IF;

  -- Trigger 6 (20h, M2): the current parent moves to the parent's replacement while the old parent is REPLACED, or to NULL while it is WITHDRAWN, in the
  -- transaction that moved the parent. There is no replacedBy column: the replacement is the bid whose replacesOnlineBidId is the old parent.
  IF NEW."parentOnlineBidId" IS DISTINCT FROM OLD."parentOnlineBidId" THEN
    SELECT p."status"::text, (p."xmin" = pg_current_xact_id()::xid) INTO old_parent_status, old_parent_mine FROM "OnlineBid" p WHERE p."id" = OLD."parentOnlineBidId";
    IF OLD."parentOnlineBidId" IS NULL
       OR old_parent_mine IS NOT TRUE
       OR NOT ((NEW."parentOnlineBidId" IS NULL AND old_parent_status = 'WITHDRAWN')
            OR (old_parent_status = 'REPLACED' AND EXISTS (SELECT 1 FROM "OnlineBid" r WHERE r."id" = NEW."parentOnlineBidId" AND r."replacesOnlineBidId" = OLD."parentOnlineBidId"))) THEN
      RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: an alternative''s parent moves only to its parent''s replacement, or to none on its parent''s withdrawal, in that act', OLD."id"
        USING ERRCODE = 'PA016', HINT = 'ADR 0036 D7, ruling 20h, M2. No link ever points at a replaced or withdrawn bid, and none is added after submission.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ trigger 3: a submission is written whole, in its own transaction

CREATE FUNCTION "sealed_online_bid_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'SUBMITTED' OR NEW."statusAt" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM "BidEnvelope" e WHERE e."id" = NEW."envelopeId" AND e."channel" = 'ONLINE' AND e."status" = 'RECEIVED'
                      AND e."exerciseId" = NEW."exerciseId" AND e."organisationId" = NEW."organisationId" AND e."kind"::text = NEW."kind"::text
                      AND e."xmin" = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: its ONLINE envelope, of the same kind, was not inserted in this transaction'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D5, S11. The envelope and the submission are written by one act, in one transaction.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."exerciseId" = NEW."exerciseId" AND k."retiredAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: it is not sealed under the exercise''s live key'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D3, S10.';
  END IF;
  IF NEW."parentOnlineBidId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "OnlineBid" p WHERE p."id" = NEW."parentOnlineBidId" AND p."exerciseId" = NEW."exerciseId" AND p."supplierId" = NEW."supplierId" AND p."status" = 'SUBMITTED') THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: the parent it names is not the same supplier''s live submission on this exercise'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D7, ruling 20h (PARENT_NOT_YOUR_LIVE_BID).';
  END IF;
  IF NEW."replacesOnlineBidId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "OnlineBid" p WHERE p."id" = NEW."replacesOnlineBidId" AND p."exerciseId" = NEW."exerciseId" AND p."supplierId" = NEW."supplierId" AND p."status" = 'SUBMITTED') THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: the submission it replaces is not the same supplier''s live submission on this exercise'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D7.';
  END IF;
  RETURN NEW;
END
$$;

-- Each file belongs to one submission (fileId is unique), is the same supplier's draft under the same key, and is taken in the submission's own transaction.
CREATE FUNCTION "sealed_online_bid_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% on "OnlineBidPart" is refused: the files a submission took never change', TG_OP
      USING ERRCODE = CASE WHEN TG_OP = 'DELETE' THEN 'PA020' ELSE 'PA014' END, HINT = 'ADR 0036 D5, H2.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "OnlineBid" b JOIN "OnlineBidFile" f ON f."id" = NEW."fileId"
                 WHERE b."id" = NEW."onlineBidId" AND b."xmin" = pg_current_xact_id()::xid AND b."organisationId" = NEW."organisationId"
                   AND f."organisationId" = b."organisationId" AND f."exerciseId" = b."exerciseId" AND f."supplierId" = b."supplierId" AND f."keyId" = b."keyId" AND f."state" = 'DRAFT') THEN
    RAISE EXCEPTION 'INSERT of "OnlineBidPart" is refused: the file is not the same supplier''s draft under the same key, or the submission was not written in this transaction'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D5, H2. Each file belongs to one submission.';
  END IF;
  RETURN NEW;
END
$$;

-- A bid file is uploaded as a draft, with no released key, under the exercise's live key.
CREATE FUNCTION "sealed_online_bid_file_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" <> 'DRAFT' OR NEW."releasedDek" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM "ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."exerciseId" = NEW."exerciseId" AND k."organisationId" = NEW."organisationId" AND k."retiredAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "OnlineBidFile" is refused: a part is uploaded as a draft, with no released key, under the exercise''s live key'
      USING ERRCODE = 'PA024', HINT = 'ADR 0036 D5, S10.';
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ triggers 4 and 5 on OnlineBidFile

CREATE FUNCTION "sealed_online_bid_file_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['state', 'releasedDek']) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a bid file''s ciphertext, sealed key, metadata and identity never change', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D12, S8. Ciphertext is immutable.';
  END IF;
  IF NEW."state" IS DISTINCT FROM OLD."state" AND (OLD."state" <> 'DRAFT' OR NEW."state" NOT IN ('SUBMITTED', 'DISCARDED')) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % from % to % is refused: a draft is taken by a submission or discarded, once', OLD."id", OLD."state", NEW."state"
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D5.';
  END IF;
  -- Trigger 5 (M5): NULL to set only while the file's opening is being finalised in this transaction, after its finalisedAt is written.
  IF NEW."releasedDek" IS DISTINCT FROM OLD."releasedDek" THEN
    IF OLD."releasedDek" IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM "OnlineBidPart" p
                       JOIN "OnlineBid" b ON b."id" = p."onlineBidId"
                       JOIN "OpenedBid" ob ON ob."envelopeId" = b."envelopeId"
                       JOIN "Opening" o ON o."id" = ob."openingId"
                     WHERE p."fileId" = NEW."id" AND b."status" = 'OPENED' AND o."finalisedAt" IS NOT NULL AND o."xmin" = pg_current_xact_id()::xid) THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a data key is released only while its opening is being finalised', OLD."id"
          USING ERRCODE = 'PA015', HINT = 'ADR 0036 D10, M5. The finalise sets finalisedAt first, then the released keys.';
      END IF;
    ELSE
      -- Set to NULL (the shred) only once the file's document owner link exists: that link (unique onlineBidFileId) is built with the mover in wave 3b
      -- step 15, which replaces this function. Until then no link can exist, so the shred is refused, and any other change of a released key always is.
      RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a released data key is shredded only once the file''s document link exists', OLD."id"
        USING ERRCODE = 'PA015', HINT = 'ADR 0036 D10, M5. The mover writes the link, then shreds the key.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ trigger 4 on the key tables, the releases, the grants and the lodgement

CREATE FUNCTION "sealed_officer_key_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['failedAttempts', 'lockedUntil', 'retiredAt', 'retiredReason'])
     OR (OLD."retiredAt" IS NOT NULL AND (NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt" OR NEW."retiredReason" IS DISTINCT FROM OLD."retiredReason")) THEN
    RAISE EXCEPTION 'UPDATE of "OfficerExerciseKey" % is refused: the key material never changes, and a retirement is final', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D3, D4. Only the lockout counter moves; a new passphrase is a new key.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "sealed_exercise_key_change"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  closing timestamp;
BEGIN
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['retiredAt', 'retiredReason']) OR OLD."retiredAt" IS NOT NULL THEN
    RAISE EXCEPTION 'UPDATE of "ExerciseSealingKey" % is refused: the key and its fingerprint never change, and a retirement is final', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D3, D11.';
  END IF;
  IF NEW."retiredAt" IS NOT NULL THEN
    SELECT e."closingAt" INTO closing FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId";
    IF closing IS NOT NULL AND date_trunc('second', "sealed_clock"()) > closing THEN
      RAISE EXCEPTION 'UPDATE of "ExerciseSealingKey" % is refused: no key is retired after the closing', OLD."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 11 and 20g. After the closing a lost share means re-tender.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- A share goes from set to NULL only by a shred: when its whole key is retired (a re-key, or a roster change before publication, 20g), or when its officer has
-- released it at a substitution. A shredded share is ended, and nothing else about a share changes.
CREATE FUNCTION "sealed_key_share_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['sealedShare', 'endedAt', 'endedReason'])
     OR (OLD."sealedShare" IS NULL AND NEW."sealedShare" IS NOT NULL)
     OR (OLD."sealedShare" IS NOT NULL AND NEW."sealedShare" IS NOT NULL AND NEW."sealedShare" <> OLD."sealedShare")
     OR (OLD."endedAt" IS NOT NULL AND (NEW."endedAt" IS DISTINCT FROM OLD."endedAt" OR NEW."endedReason" IS DISTINCT FROM OLD."endedReason")) THEN
    RAISE EXCEPTION 'UPDATE of "ExerciseKeyShare" % is refused: a share never changes, and a shred goes from set to NULL only, once', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D3, C-2.';
  END IF;
  IF OLD."sealedShare" IS NOT NULL AND NEW."sealedShare" IS NULL
     AND NOT EXISTS (SELECT 1 FROM "ExerciseSealingKey" k WHERE k."id" = OLD."keyId" AND k."retiredAt" IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM "ShareRelease" r WHERE r."keyId" = OLD."keyId" AND r."purpose" = 'SUBSTITUTION' AND r."fromOfficerKeyId" = OLD."officerKeyId") THEN
    RAISE EXCEPTION 'UPDATE of "ExerciseKeyShare" % is refused: a share is shredded only when its key is retired or its officer has released it at a substitution', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D11, ruling 20g.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "sealed_share_release_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['sealedShares', 'usedAt', 'lapsedAt'])
     OR (OLD."sealedShares" IS NULL AND NEW."sealedShares" IS NOT NULL)
     OR (OLD."sealedShares" IS NOT NULL AND NEW."sealedShares" IS NOT NULL AND NEW."sealedShares" <> OLD."sealedShares")
     OR (OLD."usedAt" IS NOT NULL AND NEW."usedAt" IS DISTINCT FROM OLD."usedAt")
     OR (OLD."lapsedAt" IS NOT NULL AND NEW."lapsedAt" IS DISTINCT FROM OLD."lapsedAt") THEN
    RAISE EXCEPTION 'UPDATE of "ShareRelease" % is refused: a release never changes, and a shred goes from set to NULL only, once used or lapsed', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D10, M1, C-2.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "sealed_never_changes"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE of "%" is refused: a sealed grant never changes', TG_TABLE_NAME
    USING ERRCODE = 'PA014', HINT = 'ADR 0036 D10.';
END
$$;

-- ------------------------------------------------------------------ trigger 8: LODGEMENT_CLOSED

CREATE FUNCTION "sealed_lodgement_rules"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  closing timestamp;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT "sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['supersededAt', 'supersededReason']) OR OLD."supersededAt" IS NOT NULL THEN
      RAISE EXCEPTION 'UPDATE of "SealedEstimateLodgement" % is refused: a lodgement never changes, and is superseded once', OLD."id"
        USING ERRCODE = 'PA014', HINT = 'ADR 0036 D10, FR-EST-007.';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM "ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."exerciseId" = NEW."exerciseId" AND k."retiredAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "SealedEstimateLodgement" is refused: it is not sealed under the exercise''s live key'
      USING ERRCODE = 'PA018', HINT = 'ADR 0036 D10, ruling 20g.';
  END IF;
  SELECT e."closingAt" INTO closing FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF closing IS NOT NULL AND date_trunc('second', "sealed_clock"()) > closing THEN
    RAISE EXCEPTION 'LODGEMENT_CLOSED: the sealed estimate is not lodged or superseded after the closing'
      USING ERRCODE = 'PA018', HINT = 'ADR 0036 D10, ruling 20g, FR-EST-007.';
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ triggers 7 and 9: the keys, the fingerprint and the pepper

CREATE FUNCTION "sealed_officer_key_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mode text;
  channel_pin text;
BEGIN
  SELECT e."onlineSubmissionMode"::text, e."submissionChannel"::text INTO mode, channel_pin FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF channel_pin IS DISTINCT FROM 'ONLINE' OR NEW."retiredAt" IS NOT NULL OR NEW."failedAttempts" <> 0 OR NEW."lockedUntil" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM "ExerciseOpeningOfficer" r WHERE r."id" = NEW."openingOfficerId" AND r."exerciseId" = NEW."exerciseId" AND r."personId" = NEW."personId" AND r."endedAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "OfficerExerciseKey" is refused: an officer key is set by the named officer on their own live roster row, on an ONLINE exercise'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3, 20d.';
  END IF;
  IF NEW."pepperId" IS NULL AND mode IS NOT DISTINCT FROM 'LIVE' THEN
    RAISE EXCEPTION 'INSERT of "OfficerExerciseKey" is refused: a key on a LIVE exercise is wrapped with the deployment''s pepper'
      USING ERRCODE = 'PA019', HINT = 'ADR 0036 D4, ruling 20v. A wrap without a pepper is for DEMONSTRATION only.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "sealed_exercise_key_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  closing timestamp;
  channel_pin text;
BEGIN
  SELECT e."closingAt", e."submissionChannel"::text INTO closing, channel_pin FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF channel_pin IS DISTINCT FROM 'ONLINE' OR NEW."retiredAt" IS NOT NULL THEN
    RAISE EXCEPTION 'INSERT of "ExerciseSealingKey" is refused: a live exercise key is made only on an ONLINE exercise'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3.';
  END IF;
  IF closing IS NOT NULL AND date_trunc('second', "sealed_clock"()) > closing THEN
    RAISE EXCEPTION 'INSERT of "ExerciseSealingKey" is refused: no key is made after the closing'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 11 and 20g.';
  END IF;
  RETURN NEW;
END
$$;

-- Deferred to the commit, so the act may write its rows in any order: after publication a key is made or retired only with a PublishedKeyChange that this
-- transaction wrote, naming it.
CREATE FUNCTION "sealed_exercise_key_published_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SourcingExercise" e WHERE e."id" = NEW."exerciseId" AND e."publishedKeyFingerprint" IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM "PublishedKeyChange" c WHERE c."toKeyId" = NEW."id" AND c."xmin" = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'INSERT of "ExerciseSealingKey" % on a published exercise is refused: a new key after publication needs a recorded key change in the same transaction', NEW."id"
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 20g, 20p, S10.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."retiredAt" IS NULL AND NEW."retiredAt" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "PublishedKeyChange" c WHERE c."fromKeyId" = NEW."id" AND c."xmin" = pg_current_xact_id()::xid) THEN
      RAISE EXCEPTION 'UPDATE of "ExerciseSealingKey" % on a published exercise is refused: retiring the key after publication needs a recorded key change in the same transaction', NEW."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 20g, 20p, S10.';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

-- A recorded key change names two keys of the same exercise, by their own fingerprints.
CREATE FUNCTION "sealed_key_change_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ExerciseSealingKey" f, "ExerciseSealingKey" t
                 WHERE f."id" = NEW."fromKeyId" AND t."id" = NEW."toKeyId" AND f."exerciseId" = NEW."exerciseId" AND t."exerciseId" = NEW."exerciseId"
                   AND f."fingerprint" = NEW."fromFingerprint" AND t."fingerprint" = NEW."toFingerprint") THEN
    RAISE EXCEPTION 'INSERT of "PublishedKeyChange" is refused: it names keys of another exercise, or fingerprints that are not theirs'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11.';
  END IF;
  RETURN NEW;
END
$$;

-- The published fingerprint: set at publication to the live key's, and moved only with a recorded key change in the same transaction (deferred). Never cleared.
-- The online mode, once frozen at publication, never changes (20i), and is frozen as LIVE only where no live officer key lacks the pepper (trigger 9).
CREATE FUNCTION "sealed_exercise_pins"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."onlineSubmissionMode" IS NOT NULL AND NEW."onlineSubmissionMode" IS DISTINCT FROM OLD."onlineSubmissionMode" THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the online mode frozen at publication never changes', OLD."id"
      USING ERRCODE = 'PA023', HINT = 'ADR 0036 D1, ruling 20i. A demonstration exercise is never promoted to a real one.';
  END IF;
  IF NEW."onlineSubmissionMode" = 'LIVE' AND OLD."onlineSubmissionMode" IS NULL
     AND EXISTS (SELECT 1 FROM "OfficerExerciseKey" k WHERE k."exerciseId" = NEW."id" AND k."retiredAt" IS NULL AND k."pepperId" IS NULL) THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: it cannot be frozen LIVE while an officer key is wrapped without the pepper', OLD."id"
      USING ERRCODE = 'PA019', HINT = 'ADR 0036 D4, ruling 20v.';
  END IF;
  IF NEW."publishedKeyFingerprint" IS DISTINCT FROM OLD."publishedKeyFingerprint" THEN
    IF NEW."publishedKeyFingerprint" IS NULL THEN
      RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: a published fingerprint is never cleared', OLD."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3, S10.';
    END IF;
    IF OLD."publishedKeyFingerprint" IS NULL AND NOT EXISTS (SELECT 1 FROM "ExerciseSealingKey" k WHERE k."exerciseId" = NEW."id" AND k."retiredAt" IS NULL AND k."fingerprint" = NEW."publishedKeyFingerprint") THEN
      RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the fingerprint frozen at publication is the live key''s', OLD."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3, S10.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "sealed_fingerprint_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedKeyFingerprint" IS NOT NULL AND NEW."publishedKeyFingerprint" IS DISTINCT FROM OLD."publishedKeyFingerprint"
     AND NOT EXISTS (SELECT 1 FROM "PublishedKeyChange" c WHERE c."exerciseId" = NEW."id" AND c."fromFingerprint" = OLD."publishedKeyFingerprint"
                       AND c."toFingerprint" = NEW."publishedKeyFingerprint" AND c."xmin" = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the published fingerprint moves only with a recorded key change in the same transaction', NEW."id"
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 20g, 20p, S10.';
  END IF;
  RETURN NULL;
END
$$;

-- ------------------------------------------------------------------ the price, and the opening's finalising

CREATE FUNCTION "sealed_price_at_finalise"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."finalisedAt" IS NULL AND NEW."finalisedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM "OpenedBid" b WHERE b."openingId" = NEW."id" AND b."priceAsRead" IS NULL) THEN
    RAISE EXCEPTION 'UPDATE of "Opening" % is refused: it is not finalised while any of its bids has no price as read', NEW."id"
      USING ERRCODE = 'PA021', HINT = 'ADR 0036 D10, ruling 20. The finalise writes the declared figures first, then finalisedAt.';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION "sealed_price_null_online_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."priceAsRead" IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM "BidEnvelope" e WHERE e."id" = NEW."envelopeId" AND e."channel" = 'ONLINE')
       OR EXISTS (SELECT 1 FROM "Opening" o WHERE o."id" = NEW."openingId" AND o."finalisedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'A bid with no price as read is refused: only an online bid, between its unseal and the finalising, has none'
        USING ERRCODE = 'PA021', HINT = 'ADR 0036 D10, ruling 20.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ trigger 10: no DELETE, no TRUNCATE

CREATE FUNCTION "refuse_sealed_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on "%" is refused: sealed records are never removed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'PA020', HINT = 'ADR 0036 D12. A shred sets a column to NULL; a row is never deleted, by any database login.';
END
$$;

CREATE FUNCTION "refuse_online_envelope_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."channel" = 'ONLINE' THEN
    RAISE EXCEPTION 'DELETE of an ONLINE envelope is refused: the register never loses a submission'
      USING ERRCODE = 'PA020', HINT = 'ADR 0036 D12, FR-BID-003.';
  END IF;
  RETURN OLD;
END
$$;

-- ------------------------------------------------------------------ the triggers
-- To undo, drop the triggers first, then the functions.

CREATE TRIGGER "BidEnvelope_online_stamp" BEFORE INSERT ON "BidEnvelope" FOR EACH ROW EXECUTE FUNCTION "sealed_envelope_stamp"();
CREATE TRIGGER "BidEnvelope_online_move" BEFORE UPDATE ON "BidEnvelope" FOR EACH ROW EXECUTE FUNCTION "sealed_envelope_move"();
CREATE TRIGGER "BidEnvelope_online_kept" BEFORE DELETE ON "BidEnvelope" FOR EACH ROW EXECUTE FUNCTION "refuse_online_envelope_delete"();
ALTER TABLE "BidEnvelope" ENABLE ALWAYS TRIGGER "BidEnvelope_online_stamp";
ALTER TABLE "BidEnvelope" ENABLE ALWAYS TRIGGER "BidEnvelope_online_move";
ALTER TABLE "BidEnvelope" ENABLE ALWAYS TRIGGER "BidEnvelope_online_kept";

CREATE TRIGGER "OnlineBid_insert" BEFORE INSERT ON "OnlineBid" FOR EACH ROW EXECUTE FUNCTION "sealed_online_bid_insert"();
CREATE TRIGGER "OnlineBid_change" BEFORE UPDATE ON "OnlineBid" FOR EACH ROW EXECUTE FUNCTION "sealed_online_bid_change"();
ALTER TABLE "OnlineBid" ENABLE ALWAYS TRIGGER "OnlineBid_insert";
ALTER TABLE "OnlineBid" ENABLE ALWAYS TRIGGER "OnlineBid_change";

CREATE TRIGGER "OnlineBidPart_rules" BEFORE INSERT OR UPDATE OR DELETE ON "OnlineBidPart" FOR EACH ROW EXECUTE FUNCTION "sealed_online_bid_part"();
ALTER TABLE "OnlineBidPart" ENABLE ALWAYS TRIGGER "OnlineBidPart_rules";

CREATE TRIGGER "OnlineBidFile_insert" BEFORE INSERT ON "OnlineBidFile" FOR EACH ROW EXECUTE FUNCTION "sealed_online_bid_file_insert"();
CREATE TRIGGER "OnlineBidFile_change" BEFORE UPDATE ON "OnlineBidFile" FOR EACH ROW EXECUTE FUNCTION "sealed_online_bid_file_change"();
ALTER TABLE "OnlineBidFile" ENABLE ALWAYS TRIGGER "OnlineBidFile_insert";
ALTER TABLE "OnlineBidFile" ENABLE ALWAYS TRIGGER "OnlineBidFile_change";

CREATE TRIGGER "OfficerExerciseKey_insert" BEFORE INSERT ON "OfficerExerciseKey" FOR EACH ROW EXECUTE FUNCTION "sealed_officer_key_insert"();
CREATE TRIGGER "OfficerExerciseKey_change" BEFORE UPDATE ON "OfficerExerciseKey" FOR EACH ROW EXECUTE FUNCTION "sealed_officer_key_change"();
ALTER TABLE "OfficerExerciseKey" ENABLE ALWAYS TRIGGER "OfficerExerciseKey_insert";
ALTER TABLE "OfficerExerciseKey" ENABLE ALWAYS TRIGGER "OfficerExerciseKey_change";

CREATE TRIGGER "ExerciseSealingKey_insert" BEFORE INSERT ON "ExerciseSealingKey" FOR EACH ROW EXECUTE FUNCTION "sealed_exercise_key_insert"();
CREATE TRIGGER "ExerciseSealingKey_change" BEFORE UPDATE ON "ExerciseSealingKey" FOR EACH ROW EXECUTE FUNCTION "sealed_exercise_key_change"();
CREATE CONSTRAINT TRIGGER "ExerciseSealingKey_published_change" AFTER INSERT OR UPDATE ON "ExerciseSealingKey" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sealed_exercise_key_published_change"();
ALTER TABLE "ExerciseSealingKey" ENABLE ALWAYS TRIGGER "ExerciseSealingKey_insert";
ALTER TABLE "ExerciseSealingKey" ENABLE ALWAYS TRIGGER "ExerciseSealingKey_change";
ALTER TABLE "ExerciseSealingKey" ENABLE ALWAYS TRIGGER "ExerciseSealingKey_published_change";

CREATE TRIGGER "ExerciseKeyShare_change" BEFORE UPDATE ON "ExerciseKeyShare" FOR EACH ROW EXECUTE FUNCTION "sealed_key_share_change"();
ALTER TABLE "ExerciseKeyShare" ENABLE ALWAYS TRIGGER "ExerciseKeyShare_change";
CREATE TRIGGER "ShareRelease_change" BEFORE UPDATE ON "ShareRelease" FOR EACH ROW EXECUTE FUNCTION "sealed_share_release_change"();
ALTER TABLE "ShareRelease" ENABLE ALWAYS TRIGGER "ShareRelease_change";
CREATE TRIGGER "OfficerDekGrant_change" BEFORE UPDATE ON "OfficerDekGrant" FOR EACH ROW EXECUTE FUNCTION "sealed_never_changes"();
ALTER TABLE "OfficerDekGrant" ENABLE ALWAYS TRIGGER "OfficerDekGrant_change";
CREATE TRIGGER "SealedEstimateLodgement_rules" BEFORE INSERT OR UPDATE ON "SealedEstimateLodgement" FOR EACH ROW EXECUTE FUNCTION "sealed_lodgement_rules"();
ALTER TABLE "SealedEstimateLodgement" ENABLE ALWAYS TRIGGER "SealedEstimateLodgement_rules";

CREATE TRIGGER "PublishedKeyChange_insert" BEFORE INSERT ON "PublishedKeyChange" FOR EACH ROW EXECUTE FUNCTION "sealed_key_change_insert"();
ALTER TABLE "PublishedKeyChange" ENABLE ALWAYS TRIGGER "PublishedKeyChange_insert";

CREATE TRIGGER "SourcingExercise_sealed_pins" BEFORE UPDATE OF "onlineSubmissionMode", "publishedKeyFingerprint" ON "SourcingExercise" FOR EACH ROW EXECUTE FUNCTION "sealed_exercise_pins"();
CREATE CONSTRAINT TRIGGER "SourcingExercise_fingerprint_change" AFTER UPDATE OF "publishedKeyFingerprint" ON "SourcingExercise" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sealed_fingerprint_change"();
ALTER TABLE "SourcingExercise" ENABLE ALWAYS TRIGGER "SourcingExercise_sealed_pins";
ALTER TABLE "SourcingExercise" ENABLE ALWAYS TRIGGER "SourcingExercise_fingerprint_change";

CREATE TRIGGER "Opening_price_at_finalise" BEFORE UPDATE OF "finalisedAt" ON "Opening" FOR EACH ROW EXECUTE FUNCTION "sealed_price_at_finalise"();
ALTER TABLE "Opening" ENABLE ALWAYS TRIGGER "Opening_price_at_finalise";
CREATE TRIGGER "OpenedBid_price_null_online_only" BEFORE INSERT OR UPDATE OF "priceAsRead" ON "OpenedBid" FOR EACH ROW EXECUTE FUNCTION "sealed_price_null_online_only"();
ALTER TABLE "OpenedBid" ENABLE ALWAYS TRIGGER "OpenedBid_price_null_online_only";

-- The two trails nobody changes (append-only, as the other trails).
CREATE TRIGGER "PublishedKeyChange_append_only" BEFORE UPDATE OR DELETE ON "PublishedKeyChange" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "PublishedKeyChange_no_truncate" BEFORE TRUNCATE ON "PublishedKeyChange" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "PublishedKeyChange" ENABLE ALWAYS TRIGGER "PublishedKeyChange_append_only";
ALTER TABLE "PublishedKeyChange" ENABLE ALWAYS TRIGGER "PublishedKeyChange_no_truncate";
CREATE TRIGGER "SealedAccessEvent_append_only" BEFORE UPDATE OR DELETE ON "SealedAccessEvent" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "SealedAccessEvent_no_truncate" BEFORE TRUNCATE ON "SealedAccessEvent" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "SealedAccessEvent" ENABLE ALWAYS TRIGGER "SealedAccessEvent_append_only";
ALTER TABLE "SealedAccessEvent" ENABLE ALWAYS TRIGGER "SealedAccessEvent_no_truncate";

-- Trigger 10 on the rest: no DELETE, no TRUNCATE.
CREATE TRIGGER "OfficerExerciseKey_kept" BEFORE DELETE ON "OfficerExerciseKey" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "OfficerExerciseKey_no_truncate" BEFORE TRUNCATE ON "OfficerExerciseKey" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "OfficerExerciseKey" ENABLE ALWAYS TRIGGER "OfficerExerciseKey_kept";
ALTER TABLE "OfficerExerciseKey" ENABLE ALWAYS TRIGGER "OfficerExerciseKey_no_truncate";
CREATE TRIGGER "ExerciseSealingKey_kept" BEFORE DELETE ON "ExerciseSealingKey" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "ExerciseSealingKey_no_truncate" BEFORE TRUNCATE ON "ExerciseSealingKey" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "ExerciseSealingKey" ENABLE ALWAYS TRIGGER "ExerciseSealingKey_kept";
ALTER TABLE "ExerciseSealingKey" ENABLE ALWAYS TRIGGER "ExerciseSealingKey_no_truncate";
CREATE TRIGGER "ExerciseKeyShare_kept" BEFORE DELETE ON "ExerciseKeyShare" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "ExerciseKeyShare_no_truncate" BEFORE TRUNCATE ON "ExerciseKeyShare" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "ExerciseKeyShare" ENABLE ALWAYS TRIGGER "ExerciseKeyShare_kept";
ALTER TABLE "ExerciseKeyShare" ENABLE ALWAYS TRIGGER "ExerciseKeyShare_no_truncate";
CREATE TRIGGER "ShareRelease_kept" BEFORE DELETE ON "ShareRelease" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "ShareRelease_no_truncate" BEFORE TRUNCATE ON "ShareRelease" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "ShareRelease" ENABLE ALWAYS TRIGGER "ShareRelease_kept";
ALTER TABLE "ShareRelease" ENABLE ALWAYS TRIGGER "ShareRelease_no_truncate";
CREATE TRIGGER "OnlineBidFile_kept" BEFORE DELETE ON "OnlineBidFile" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "OnlineBidFile_no_truncate" BEFORE TRUNCATE ON "OnlineBidFile" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "OnlineBidFile" ENABLE ALWAYS TRIGGER "OnlineBidFile_kept";
ALTER TABLE "OnlineBidFile" ENABLE ALWAYS TRIGGER "OnlineBidFile_no_truncate";
CREATE TRIGGER "OnlineBid_kept" BEFORE DELETE ON "OnlineBid" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "OnlineBid_no_truncate" BEFORE TRUNCATE ON "OnlineBid" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "OnlineBid" ENABLE ALWAYS TRIGGER "OnlineBid_kept";
ALTER TABLE "OnlineBid" ENABLE ALWAYS TRIGGER "OnlineBid_no_truncate";
CREATE TRIGGER "OnlineBidPart_no_truncate" BEFORE TRUNCATE ON "OnlineBidPart" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "OnlineBidPart" ENABLE ALWAYS TRIGGER "OnlineBidPart_no_truncate";
CREATE TRIGGER "OfficerDekGrant_kept" BEFORE DELETE ON "OfficerDekGrant" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "OfficerDekGrant_no_truncate" BEFORE TRUNCATE ON "OfficerDekGrant" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "OfficerDekGrant" ENABLE ALWAYS TRIGGER "OfficerDekGrant_kept";
ALTER TABLE "OfficerDekGrant" ENABLE ALWAYS TRIGGER "OfficerDekGrant_no_truncate";
CREATE TRIGGER "SealedEstimateLodgement_kept" BEFORE DELETE ON "SealedEstimateLodgement" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "SealedEstimateLodgement_no_truncate" BEFORE TRUNCATE ON "SealedEstimateLodgement" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "SealedEstimateLodgement" ENABLE ALWAYS TRIGGER "SealedEstimateLodgement_kept";
ALTER TABLE "SealedEstimateLodgement" ENABLE ALWAYS TRIGGER "SealedEstimateLodgement_no_truncate";
CREATE TRIGGER "BidSealingPolicy_kept" BEFORE DELETE ON "BidSealingPolicy" FOR EACH ROW EXECUTE FUNCTION "refuse_sealed_delete"();
CREATE TRIGGER "BidSealingPolicy_no_truncate" BEFORE TRUNCATE ON "BidSealingPolicy" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_sealed_delete"();
ALTER TABLE "BidSealingPolicy" ENABLE ALWAYS TRIGGER "BidSealingPolicy_kept";
ALTER TABLE "BidSealingPolicy" ENABLE ALWAYS TRIGGER "BidSealingPolicy_no_truncate";
