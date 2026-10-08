-- Phase 4b: CPD's supplier registration after the officer's acceptance (steps 2 to 5 of the wizard), the CPD review of it, and the bank details (FR-VND-002, 004, 005, 006, 007).
-- Every change is additive. Existing rows read as they did: a new text column is blank, a new setting is not set, and an old supplier document or version still names the officer who
-- recorded it. Two columns lose NOT NULL (the officer who recorded a supplier document or a version), because a signed-in supplier now records some, and a CHECK holds exactly one recorder.
-- Beyond what Prisma writes: the CHECKs and triggers below, hand-appended.
-- The four enum values this uses (BANK, ACCOUNT_TYPE, SUPPLIER_DRAFT_DOCUMENT and SUPPLIER_BANK_STATEMENT) were added by the four migrations before this one, each in its own, because
-- a value added to an enum cannot be used in the transaction that adds it.

-- CreateEnum
CREATE TYPE "DeclarationKind" AS ENUM ('GIRO_AUTHORISATION', 'FALSE_DECLARATION');

-- AlterTable
ALTER TABLE "DocumentAccessEvent" ADD COLUMN     "actorSupplierAccountId" TEXT;

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "creditorProfileId" TEXT,
ADD COLUMN     "registrationDraftDocumentId" TEXT;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "recordedBySupplierAccountId" TEXT,
ALTER COLUMN "recordedByPersonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SulitAccessEvent" ADD COLUMN     "actorSupplierAccountId" TEXT;

-- AlterTable
ALTER TABLE "SupplierApplication" ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedBySupplierAccountId" TEXT;

-- AlterTable
ALTER TABLE "SupplierDocument" ADD COLUMN     "ratePercent" DECIMAL(5,2),
ADD COLUMN     "recordedBySupplierAccountId" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "recordedByPersonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupplierDocumentType" ADD COLUMN     "hintEn" TEXT,
ADD COLUMN     "hintMs" TEXT,
ADD COLUMN     "recordsRate" BOOLEAN,
ADD COLUMN     "repeatable" BOOLEAN;

-- AlterTable
ALTER TABLE "SupplierPolicy" ADD COLUMN     "helpEmail" TEXT,
ADD COLUMN     "helpPhone" TEXT,
ADD COLUMN     "helpProvenance" "Provenance",
ADD COLUMN     "onlineDeclarationProvenance" "Provenance",
ADD COLUMN     "onlineDeclarationReplacesPaper" BOOLEAN,
ADD COLUMN     "supplierBankStatementClassId" TEXT,
ADD COLUMN     "supplierUploadClassId" TEXT,
ADD COLUMN     "uploadClassProvenance" "Provenance",
ADD COLUMN     "uploadLimitProvenance" "Provenance",
ADD COLUMN     "uploadMaxBytesPerApplication" BIGINT,
ADD COLUMN     "uploadMaxFilesPerApplication" INTEGER;

-- CreateTable
CREATE TABLE "RegistrationDraft" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "signatoryDesignation" TEXT NOT NULL DEFAULT '',
    "giroConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "lastSavedBySupplierAccountId" TEXT NOT NULL,
    "lastSavedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "RegistrationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationDraftDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "issuingAuthority" TEXT NOT NULL DEFAULT '',
    "expiresOn" TIMESTAMP(3),
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "ratePercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationDraftDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationDraftValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "draftDocumentId" TEXT NOT NULL,
    "registrationValueId" TEXT NOT NULL,

    CONSTRAINT "RegistrationDraftValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditorProfile" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "supersedesId" TEXT,
    "beneficiaryName" TEXT NOT NULL DEFAULT '',
    "beneficiaryAddress" TEXT NOT NULL DEFAULT '',
    "beneficiaryIdentityNo" TEXT NOT NULL DEFAULT '',
    "beneficiaryContactPerson" TEXT NOT NULL DEFAULT '',
    "beneficiaryTelephone" TEXT NOT NULL DEFAULT '',
    "beneficiaryFax" TEXT NOT NULL DEFAULT '',
    "beneficiaryTaxRegistrationNo" TEXT NOT NULL DEFAULT '',
    "beneficiaryEmail" TEXT NOT NULL DEFAULT '',
    "bankCode" TEXT NOT NULL DEFAULT '',
    "bankAccountNo" TEXT NOT NULL DEFAULT '',
    "bankAccountTypeCode" TEXT NOT NULL DEFAULT '',
    "bankSwiftCode" TEXT NOT NULL DEFAULT '',
    "bankAddress" TEXT NOT NULL DEFAULT '',
    "enteredBySupplierAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "verification" "VerificationState" NOT NULL DEFAULT 'NOT_CHECKED',
    "verifiedByPersonId" TEXT,
    "verifiedOn" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CreditorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationText" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "DeclarationKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyMs" TEXT,
    "provenance" "Provenance" NOT NULL,
    "governingSource" TEXT NOT NULL DEFAULT '',
    "issuedOn" TIMESTAMP(3) NOT NULL,
    "retiredOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationDeclaration" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "creditorProfileId" TEXT,
    "kind" "DeclarationKind" NOT NULL,
    "textId" TEXT NOT NULL,
    "textVersion" INTEGER NOT NULL,
    "textSha256" CHAR(64) NOT NULL,
    "frozenTextEn" TEXT NOT NULL,
    "frozenTextMs" TEXT NOT NULL DEFAULT '',
    "signatoryName" TEXT NOT NULL,
    "signatoryDesignation" TEXT NOT NULL,
    "signedOn" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signedBySupplierAccountId" TEXT NOT NULL,

    CONSTRAINT "RegistrationDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationDraft_supplierId_key" ON "RegistrationDraft"("supplierId");

-- CreateIndex
CREATE INDEX "RegistrationDraftDocument_draftId_idx" ON "RegistrationDraftDocument"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationDraftValue_draftDocumentId_registrationValueId_key" ON "RegistrationDraftValue"("draftDocumentId", "registrationValueId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditorProfile_supersedesId_key" ON "CreditorProfile"("supersedesId");

-- CreateIndex
CREATE INDEX "CreditorProfile_organisationId_supplierId_idx" ON "CreditorProfile"("organisationId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditorProfile_supplierId_version_key" ON "CreditorProfile"("supplierId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DeclarationText_organisationId_kind_version_key" ON "DeclarationText"("organisationId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationDeclaration_applicationId_kind_key" ON "RegistrationDeclaration"("applicationId", "kind");

-- CreateIndex
CREATE INDEX "DocumentAttachment_registrationDraftDocumentId_idx" ON "DocumentAttachment"("registrationDraftDocumentId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_creditorProfileId_idx" ON "DocumentAttachment"("creditorProfileId");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_recordedBySupplierAccountId_fkey" FOREIGN KEY ("recordedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_registrationDraftDocumentId_fkey" FOREIGN KEY ("registrationDraftDocumentId") REFERENCES "RegistrationDraftDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_creditorProfileId_fkey" FOREIGN KEY ("creditorProfileId") REFERENCES "CreditorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessEvent" ADD CONSTRAINT "DocumentAccessEvent_actorSupplierAccountId_fkey" FOREIGN KEY ("actorSupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_supplierUploadClassId_fkey" FOREIGN KEY ("supplierUploadClassId") REFERENCES "DocumentClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_supplierBankStatementClassId_fkey" FOREIGN KEY ("supplierBankStatementClassId") REFERENCES "DocumentClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_submittedBySupplierAccountId_fkey" FOREIGN KEY ("submittedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_recordedBySupplierAccountId_fkey" FOREIGN KEY ("recordedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraft" ADD CONSTRAINT "RegistrationDraft_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraft" ADD CONSTRAINT "RegistrationDraft_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraft" ADD CONSTRAINT "RegistrationDraft_lastSavedBySupplierAccountId_fkey" FOREIGN KEY ("lastSavedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraftDocument" ADD CONSTRAINT "RegistrationDraftDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraftDocument" ADD CONSTRAINT "RegistrationDraftDocument_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "RegistrationDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraftDocument" ADD CONSTRAINT "RegistrationDraftDocument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SupplierDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraftValue" ADD CONSTRAINT "RegistrationDraftValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraftValue" ADD CONSTRAINT "RegistrationDraftValue_draftDocumentId_fkey" FOREIGN KEY ("draftDocumentId") REFERENCES "RegistrationDraftDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDraftValue" ADD CONSTRAINT "RegistrationDraftValue_registrationValueId_fkey" FOREIGN KEY ("registrationValueId") REFERENCES "RegistrationValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CreditorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_enteredBySupplierAccountId_fkey" FOREIGN KEY ("enteredBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationText" ADD CONSTRAINT "DeclarationText_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "SupplierApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_creditorProfileId_fkey" FOREIGN KEY ("creditorProfileId") REFERENCES "CreditorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_textId_fkey" FOREIGN KEY ("textId") REFERENCES "DeclarationText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_signedBySupplierAccountId_fkey" FOREIGN KEY ("signedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_actorSupplierAccountId_fkey" FOREIGN KEY ("actorSupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------------------------------
-- Hand-written below (Prisma does not write CHECKs or triggers). Every CHECK is written so that an unknown value refuses rather than passes (IS TRUE).
-- ---------------------------------------------------------------------------------------------------------------------------------

-- Who lodged a supplier's document and who recorded a version: an officer or a supplier's own account, exactly one. Every existing row names an officer, because the column
-- was NOT NULL until this migration, so no pre-check can fail.
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_one_recorder" CHECK ((num_nonnulls("recordedByPersonId", "recordedBySupplierAccountId") = 1) IS TRUE);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_one_recorder" CHECK ((num_nonnulls("recordedByPersonId", "recordedBySupplierAccountId") = 1) IS TRUE);

-- A rate is a percentage with at most two places (the column holds the places), between nothing and a hundred.
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_rate_range" CHECK (("ratePercent" IS NULL OR ("ratePercent" >= 0 AND "ratePercent" <= 100)) IS TRUE);
ALTER TABLE "RegistrationDraftDocument" ADD CONSTRAINT "RegistrationDraftDocument_rate_range" CHECK (("ratePercent" IS NULL OR ("ratePercent" >= 0 AND "ratePercent" <= 100)) IS TRUE);

-- A registration the supplier sent: the time and the account are set together, only a PORTAL application carries them, and no officer recorded it. Every earlier application has
-- neither, so it is grandfathered by the time being null.
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_submitted_pair" CHECK ((("submittedAt" IS NULL) = ("submittedBySupplierAccountId" IS NULL)) IS TRUE);
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_submitted_portal_only" CHECK (("submittedBySupplierAccountId" IS NULL OR ("channel" = 'PORTAL' AND "recordedByPersonId" IS NULL)) IS TRUE);

-- The supplier policy's new settings are positive when set. Null is not set, and refuses the act it governs.
ALTER TABLE "SupplierPolicy" ADD CONSTRAINT "SupplierPolicy_upload_limits_positive" CHECK ((("uploadMaxFilesPerApplication" IS NULL OR "uploadMaxFilesPerApplication" >= 1) AND ("uploadMaxBytesPerApplication" IS NULL OR "uploadMaxBytesPerApplication" >= 1)) IS TRUE);

-- A declaration's text: versions count from one, and a retired text was issued first.
ALTER TABLE "DeclarationText" ADD CONSTRAINT "DeclarationText_shape" CHECK (("version" >= 1 AND length(btrim("bodyEn")) > 0 AND ("retiredOn" IS NULL OR "retiredOn" >= "issuedOn")) IS TRUE);

-- A signed declaration names its signatory, and holds the hash of the wording it showed.
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_shape" CHECK ((length(btrim("signatoryName")) > 0 AND length(btrim("signatoryDesignation")) > 0 AND "textSha256" ~ '^[0-9a-f]{64}$' AND length(btrim("frozenTextEn")) > 0 AND "textVersion" >= 1) IS TRUE);

-- A creditor profile: versions count from one and one is never its own predecessor. A profile is checked only once sent, and a check names who made it, the day and the time, together.
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_shape" CHECK (("version" >= 1 AND ("supersedesId" IS NULL OR "supersedesId" <> "id")) IS TRUE);
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_verification_pair" CHECK ((
  ("verification" = 'NOT_CHECKED' AND "verifiedByPersonId" IS NULL AND "verifiedOn" IS NULL AND "verifiedAt" IS NULL)
  OR ("verification" <> 'NOT_CHECKED' AND "submittedAt" IS NOT NULL AND "verifiedByPersonId" IS NOT NULL AND "verifiedOn" IS NOT NULL AND "verifiedAt" IS NOT NULL)
) IS TRUE);

-- Attachment owners: both CHECKs rebuilt from the full list, with the registration draft's document and the creditor profile. Every other line is as 20261005130100 left it.
-- Pre-check (the SELECT CAST pattern): nothing yet carries the two new purposes, because the values were added by the migrations just before this one.
SELECT CAST((SELECT 'Pre-check failed: an attachment already has the purpose SUPPLIER_DRAFT_DOCUMENT or SUPPLIER_BANK_STATEMENT, but nothing writes one before this migration. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "DocumentAttachment" WHERE "purpose" IN ('SUPPLIER_DRAFT_DOCUMENT', 'SUPPLIER_BANK_STATEMENT'))) AS INTEGER);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId") = 1);

ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" IN ('SIGNED_MINUTES', 'SITTING_MINUTES') AND "meetingId" IS NOT NULL)
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
    OR ("purpose" = 'SUPPLIER_DRAFT_DOCUMENT' AND "registrationDraftDocumentId" IS NOT NULL)
    OR ("purpose" = 'SUPPLIER_BANK_STATEMENT' AND "creditorProfileId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
    OR ("purpose" IN ('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO') AND "contractId" IS NOT NULL)
    OR ("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL)
    OR ("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL)
    OR ("purpose" = 'DELAY_NOTICE' AND "delayNoticeId" IS NOT NULL)
    OR ("purpose" IN ('METEOROLOGICAL_RECORD', 'EOT_CALCULATION') AND "eotClaimId" IS NOT NULL)
  );

-- The access log: a signed-in supplier reading its own creditor profile is logged too, so the actor may now be a supplier's account. Exactly one actor still. The list of scopes
-- gains creditorProfile, and the closed lists of bases gain CREDITOR_PROFILE_PERMISSION and OWN_RECORD (granting). The list stays the code's (SULIT_GRANT_BASES in
-- src/lib/auth/sulit-access.ts) and a source test holds this file to it. The CHECKs are rebuilt wider, so no existing row can break them and no pre-check is needed.
ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_one_actor";
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_one_actor" CHECK (((("actorPersonId" IS NOT NULL)::int + ("actorSystemLabel" IS NOT NULL)::int + ("actorSupplierAccountId" IS NOT NULL)::int) = 1) IS TRUE);

ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_scope_known";
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_scope_known" CHECK (("scope" IN ('exercise', 'requisition', 'contract', 'supplier', 'evaluation', 'creditorProfile')) IS TRUE);

ALTER TABLE "SulitAccessEvent" DROP CONSTRAINT "SulitAccessEvent_basis_matches_outcome";
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK ((("outcome" = 'GRANTED' AND "basis" IN ('NAMED_ON_RECORD', 'ORGANISATION_PERMISSION', 'IN_CUSTODY', 'SECRETARIAT_OFFICE', 'INTERNAL_AUDIT_OFFICE', 'CREDITOR_PROFILE_PERMISSION', 'OWN_RECORD')) OR ("outcome" = 'WITHHELD' AND "basis" IN ('ADMINISTRATOR', 'NOT_A_PERSON', 'RESTRICTED_NOT_NAMED', 'NOT_NAMED_PERMISSION_UNDECIDED', 'NOT_NAMED_PERMISSION_WITHHELD', 'NOT_NAMED_PERMISSION_SCOPED', 'NOT_NAMED_PERMISSION_NOT_HELD', 'FIELD_NOT_FOR_THIS_RECORD', 'SEALED', 'CUSTODY_NOT_SET', 'NOT_IN_CUSTODY', 'CUSTODY_DAY_UNKNOWN'))) IS TRUE);

-- The document access log: at most one actor, now including a supplier's account.
ALTER TABLE "DocumentAccessEvent" DROP CONSTRAINT "DocumentAccessEvent_one_actor_at_most";
ALTER TABLE "DocumentAccessEvent" ADD CONSTRAINT "DocumentAccessEvent_one_actor_at_most" CHECK (((("actorPersonId" IS NOT NULL)::int + ("actorSystemLabel" IS NOT NULL)::int + ("actorSupplierAccountId" IS NOT NULL)::int) <= 1) IS TRUE);

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Triggers. Each refuses whoever runs it, the owner included, and ENABLE ALWAYS keeps it firing when a session sets session_replication_role to replica.
-- The tables are new and empty, so no existing row is judged.
--   PA006  a creditor profile that has been sent changes only by being checked, once
--   PA007  a registration that has been sent is frozen, and so is everything on it
-- A declaration signed is evidence and is refused every UPDATE and DELETE by the trail's own function (PA001).
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   DROP TRIGGER "RegistrationDeclaration_no_truncate" ON "RegistrationDeclaration"
--   DROP TRIGGER "RegistrationDeclaration_append_only" ON "RegistrationDeclaration"
--   DROP TRIGGER "CreditorProfile_frozen_once_sent" ON "CreditorProfile"
--   DROP TRIGGER "RegistrationDraft_frozen_once_sent" ON "RegistrationDraft"
--   DROP TRIGGER "RegistrationDraftDocument_frozen_once_sent" ON "RegistrationDraftDocument"
--   DROP TRIGGER "RegistrationDraftValue_frozen_once_sent" ON "RegistrationDraftValue"
--   DROP FUNCTION "creditor_profile_frozen"()
--   DROP FUNCTION "registration_draft_frozen"()
--   DROP FUNCTION "registration_draft_child_frozen"()
-- ---------------------------------------------------------------------------------------------------------------------------------

CREATE FUNCTION "creditor_profile_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."submittedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'DELETE on "CreditorProfile" is refused: a profile that was sent is kept'
        USING ERRCODE = 'PA006', HINT = 'A change to the bank details is a new version. The earlier one stays on the record.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."submittedAt" IS NULL THEN
    -- A draft: the supplier edits it freely, and it is not checked until it is sent.
    IF NEW."verification" <> 'NOT_CHECKED' THEN
      RAISE EXCEPTION 'A creditor profile is checked only after it was sent'
        USING ERRCODE = 'PA006', HINT = 'The officer checks the bank details once the supplier has sent them.';
    END IF;
    RETURN NEW;
  END IF;
  -- Sent: nothing but the check may change, and the check is made once.
  IF (to_jsonb(NEW) - 'verification' - 'verifiedByPersonId' - 'verifiedOn' - 'verifiedAt' - 'verificationNote') IS DISTINCT FROM (to_jsonb(OLD) - 'verification' - 'verifiedByPersonId' - 'verifiedOn' - 'verifiedAt' - 'verificationNote') THEN
    RAISE EXCEPTION 'UPDATE on "CreditorProfile" is refused: the details of a profile that was sent never change'
      USING ERRCODE = 'PA006', HINT = 'A change to the bank details is a new version, checked again before it counts for payment.';
  END IF;
  IF OLD."verification" <> 'NOT_CHECKED' AND (NEW."verification" <> OLD."verification" OR NEW."verifiedByPersonId" IS DISTINCT FROM OLD."verifiedByPersonId" OR NEW."verifiedOn" IS DISTINCT FROM OLD."verifiedOn" OR NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt" OR NEW."verificationNote" IS DISTINCT FROM OLD."verificationNote") THEN
    RAISE EXCEPTION 'UPDATE on "CreditorProfile" is refused: it was checked already'
      USING ERRCODE = 'PA006', HINT = 'A check is made once. A later change is a new version.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "CreditorProfile_frozen_once_sent" BEFORE UPDATE OR DELETE ON "CreditorProfile" FOR EACH ROW EXECUTE FUNCTION "creditor_profile_frozen"();
ALTER TABLE "CreditorProfile" ENABLE ALWAYS TRIGGER "CreditorProfile_frozen_once_sent";

CREATE FUNCTION "registration_draft_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    RAISE EXCEPTION '% on "RegistrationDraft" is refused: the registration was sent', TG_OP
      USING ERRCODE = 'PA007', HINT = 'A registration that was sent is frozen. The office holds it now.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "RegistrationDraft_frozen_once_sent" BEFORE UPDATE OR DELETE ON "RegistrationDraft" FOR EACH ROW EXECUTE FUNCTION "registration_draft_frozen"();
ALTER TABLE "RegistrationDraft" ENABLE ALWAYS TRIGGER "RegistrationDraft_frozen_once_sent";

-- A draft's documents and codes: nothing is added, changed or removed once the draft was sent. The draft's own row is read with a lock-free select, so the check costs one lookup.
CREATE FUNCTION "registration_draft_child_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sent timestamp;
  draft text;
BEGIN
  IF TG_TABLE_NAME = 'RegistrationDraftDocument' THEN
    draft := CASE WHEN TG_OP = 'DELETE' THEN OLD."draftId" ELSE NEW."draftId" END;
  ELSE
    SELECT d."draftId" INTO draft FROM "RegistrationDraftDocument" d WHERE d."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."draftDocumentId" ELSE NEW."draftDocumentId" END;
  END IF;
  SELECT r."submittedAt" INTO sent FROM "RegistrationDraft" r WHERE r."id" = draft;
  IF sent IS NOT NULL THEN
    RAISE EXCEPTION '% on "%" is refused: the registration was sent', TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'PA007', HINT = 'A registration that was sent is frozen. The office holds it now.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "RegistrationDraftDocument_frozen_once_sent" BEFORE INSERT OR UPDATE OR DELETE ON "RegistrationDraftDocument" FOR EACH ROW EXECUTE FUNCTION "registration_draft_child_frozen"();
CREATE TRIGGER "RegistrationDraftValue_frozen_once_sent" BEFORE INSERT OR UPDATE OR DELETE ON "RegistrationDraftValue" FOR EACH ROW EXECUTE FUNCTION "registration_draft_child_frozen"();
ALTER TABLE "RegistrationDraftDocument" ENABLE ALWAYS TRIGGER "RegistrationDraftDocument_frozen_once_sent";
ALTER TABLE "RegistrationDraftValue" ENABLE ALWAYS TRIGGER "RegistrationDraftValue_frozen_once_sent";

CREATE TRIGGER "RegistrationDeclaration_append_only" BEFORE UPDATE OR DELETE ON "RegistrationDeclaration" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "RegistrationDeclaration_no_truncate" BEFORE TRUNCATE ON "RegistrationDeclaration" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "RegistrationDeclaration" ENABLE ALWAYS TRIGGER "RegistrationDeclaration_append_only";
ALTER TABLE "RegistrationDeclaration" ENABLE ALWAYS TRIGGER "RegistrationDeclaration_no_truncate";
