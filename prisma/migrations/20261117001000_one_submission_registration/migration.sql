-- ADR 0041 (plan registration-one-submission-plan.md section 1): the one-submission supplier registration. Additive only: new tables, new nullable columns,
-- and CHECKs widened so that more is allowed (every existing row already satisfies each). No row is written, changed or deleted. The new enum values
-- are each in their own earlier migration (20261117000000 to 20261117000500), so they can be named here.

-- CreateEnum
CREATE TYPE "PortalApplicationForm" AS ENUM ('STEP_ONE', 'WHOLE');

-- AlterTable
ALTER TABLE "ApprovalInstance" ADD COLUMN     "portalApplicationId" TEXT;

-- AlterTable
ALTER TABLE "AuditEntry" ADD COLUMN     "actorPortalApplicationId" TEXT;

-- AlterTable
ALTER TABLE "CreditorProfile" ADD COLUMN     "enteredByPortalApplicationId" TEXT,
ALTER COLUMN "enteredBySupplierAccountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DocumentAttachment" ADD COLUMN     "portalApplicationCreditorId" TEXT,
ADD COLUMN     "portalApplicationDocumentId" TEXT;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "recordedByPortalApplicationId" TEXT;

-- AlterTable
ALTER TABLE "PortalApplication" ADD COLUMN     "decisionRemarks" TEXT,
ADD COLUMN     "form" "PortalApplicationForm",
ADD COLUMN     "sentByPersonId" TEXT;

-- AlterTable
ALTER TABLE "RegistrationDeclaration" ADD COLUMN     "noticeFrozenEn" TEXT,
ADD COLUMN     "noticeSha256" CHAR(64),
ADD COLUMN     "portalApplicationId" TEXT,
ALTER COLUMN "signedBySupplierAccountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupplierApplication" ADD COLUMN     "portalApplicationId" TEXT;

-- AlterTable
ALTER TABLE "SupplierDocument" ADD COLUMN     "recordedByPortalApplicationId" TEXT;

-- CreateTable
CREATE TABLE "PortalApplicationDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "portalApplicationId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "typeLabelSnapshot" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "issuingAuthority" TEXT NOT NULL DEFAULT '',
    "expiresOn" TIMESTAMP(3),
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "ratePercent" DECIMAL(5,2),
    "verification" "VerificationState" NOT NULL DEFAULT 'NOT_CHECKED',
    "verifiedByPersonId" TEXT,
    "verifiedOn" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalApplicationValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "portalApplicationDocumentId" TEXT NOT NULL,
    "registrationValueId" TEXT NOT NULL,
    "kind" "RegistrationValueKind" NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,

    CONSTRAINT "PortalApplicationValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalApplicationCreditor" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "portalApplicationId" TEXT NOT NULL,
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
    "verification" "VerificationState" NOT NULL DEFAULT 'NOT_CHECKED',
    "verifiedByPersonId" TEXT,
    "verifiedOn" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT NOT NULL DEFAULT '',
    "erasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalApplicationCreditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalFormToken" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tokenSha256" CHAR(64) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "portalApplicationId" TEXT,

    CONSTRAINT "PortalFormToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalApplicationDocument_portalApplicationId_idx" ON "PortalApplicationDocument"("portalApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalApplicationDocument_portalApplicationId_clientKey_key" ON "PortalApplicationDocument"("portalApplicationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "PortalApplicationValue_portalApplicationDocumentId_registra_key" ON "PortalApplicationValue"("portalApplicationDocumentId", "registrationValueId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalApplicationCreditor_portalApplicationId_key" ON "PortalApplicationCreditor"("portalApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalFormToken_tokenSha256_key" ON "PortalFormToken"("tokenSha256");

-- CreateIndex
CREATE UNIQUE INDEX "PortalFormToken_portalApplicationId_key" ON "PortalFormToken"("portalApplicationId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_portalApplicationId_idx" ON "ApprovalInstance"("portalApplicationId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_portalApplicationDocumentId_idx" ON "DocumentAttachment"("portalApplicationDocumentId");

-- CreateIndex
CREATE INDEX "DocumentAttachment_portalApplicationCreditorId_idx" ON "DocumentAttachment"("portalApplicationCreditorId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationDeclaration_portalApplicationId_kind_key" ON "RegistrationDeclaration"("portalApplicationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierApplication_portalApplicationId_key" ON "SupplierApplication"("portalApplicationId");

-- AddForeignKey
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_portalApplicationId_fkey" FOREIGN KEY ("portalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_recordedByPortalApplicationId_fkey" FOREIGN KEY ("recordedByPortalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_portalApplicationDocumentId_fkey" FOREIGN KEY ("portalApplicationDocumentId") REFERENCES "PortalApplicationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_portalApplicationCreditorId_fkey" FOREIGN KEY ("portalApplicationCreditorId") REFERENCES "PortalApplicationCreditor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApplication" ADD CONSTRAINT "SupplierApplication_portalApplicationId_fkey" FOREIGN KEY ("portalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplication" ADD CONSTRAINT "PortalApplication_sentByPersonId_fkey" FOREIGN KEY ("sentByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationDocument" ADD CONSTRAINT "PortalApplicationDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationDocument" ADD CONSTRAINT "PortalApplicationDocument_portalApplicationId_fkey" FOREIGN KEY ("portalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationDocument" ADD CONSTRAINT "PortalApplicationDocument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SupplierDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationDocument" ADD CONSTRAINT "PortalApplicationDocument_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationValue" ADD CONSTRAINT "PortalApplicationValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationValue" ADD CONSTRAINT "PortalApplicationValue_portalApplicationDocumentId_fkey" FOREIGN KEY ("portalApplicationDocumentId") REFERENCES "PortalApplicationDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationValue" ADD CONSTRAINT "PortalApplicationValue_registrationValueId_fkey" FOREIGN KEY ("registrationValueId") REFERENCES "RegistrationValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationCreditor" ADD CONSTRAINT "PortalApplicationCreditor_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationCreditor" ADD CONSTRAINT "PortalApplicationCreditor_portalApplicationId_fkey" FOREIGN KEY ("portalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalApplicationCreditor" ADD CONSTRAINT "PortalApplicationCreditor_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalFormToken" ADD CONSTRAINT "PortalFormToken_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalFormToken" ADD CONSTRAINT "PortalFormToken_portalApplicationId_fkey" FOREIGN KEY ("portalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_recordedByPortalApplicationId_fkey" FOREIGN KEY ("recordedByPortalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_enteredByPortalApplicationId_fkey" FOREIGN KEY ("enteredByPortalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_portalApplicationId_fkey" FOREIGN KEY ("portalApplicationId") REFERENCES "PortalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------------ CHECKs, each widened from its latest definition

-- ADR 0041 D5: an online application is a supplier matter's subject too. From 20261002142030, with portalApplicationId counted.
ALTER TABLE "ApprovalInstance" DROP CONSTRAINT "ApprovalInstance_supplier_matter";
ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_supplier_matter"
  CHECK (num_nonnulls("supplierApplicationId", "standingRequestId", "specialPermissionId", "portalApplicationId") = CASE WHEN "matterKind" = 'SUPPLIER' THEN 1 ELSE 0 END);

-- ADR 0041 D2: two new owners. From 20261107000100, with the two owners added.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_one_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner"
  CHECK (num_nonnulls("meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId", "onlineBidFileId", "portalApplicationDocumentId", "portalApplicationCreditorId") = 1);

-- ADR 0041 D2: two new purposes, each on its own owner. From 20261115000100, with the two lines added.
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT "DocumentAttachment_purpose_owner";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner"
  CHECK (
    ("purpose" IN ('SIGNED_MINUTES', 'SITTING_MINUTES') AND "meetingId" IS NOT NULL)
    OR ("purpose" = 'SPEC_PANEL_FORM' AND "specificationPanelId" IS NOT NULL)
    OR ("purpose" = 'BQ_IMPORT_SOURCE' AND "bqVersionId" IS NOT NULL)
    OR ("purpose" = 'TENDER_PART' AND "tenderPackPartId" IS NOT NULL)
    OR ("purpose" = 'ADDENDUM_SIGNED' AND "addendumId" IS NOT NULL)
    OR ("purpose" IN ('DOSSIER_EVIDENCE', 'COORDINATION_SCOPE', 'PUBLICATION_PROOF', 'ATTENDANCE_SHEET', 'PUBLISHED_SCHEDULE') AND "exerciseId" IS NOT NULL)
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
    OR ("purpose" = 'ONLINE_BID_FILE' AND "onlineBidFileId" IS NOT NULL)
    OR ("purpose" = 'PORTAL_APPLICATION_DOCUMENT' AND "portalApplicationDocumentId" IS NOT NULL)
    OR ("purpose" = 'PORTAL_APPLICATION_BANK_STATEMENT' AND "portalApplicationCreditorId" IS NOT NULL)
    OR ("purpose" = 'HOLDER_RECOMMENDATION' AND "delegationId" IS NOT NULL)
    OR ("purpose" IN ('SIGNED_LETTER', 'DECLARATION', 'AUTHORISATION', 'ACCEPTANCE_PAGE') AND "awardId" IS NOT NULL)
    OR ("purpose" IN ('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE') AND "contractId" IS NOT NULL)
    OR ("purpose" IN ('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO') AND "contractId" IS NOT NULL)
    OR ("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL)
    OR ("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL)
    OR ("purpose" = 'DELAY_NOTICE' AND "delayNoticeId" IS NOT NULL)
    OR ("purpose" IN ('METEOROLOGICAL_RECORD', 'EOT_CALCULATION') AND "eotClaimId" IS NOT NULL)
  );

-- ADR 0041 D3: the applicant, not signed in, is a third kind of recorder. From 20261013100000, over three columns.
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_one_recorder";
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_one_recorder" CHECK ((num_nonnulls("recordedByPersonId", "recordedBySupplierAccountId", "recordedByPortalApplicationId") = 1) IS TRUE);
ALTER TABLE "SupplierDocument" DROP CONSTRAINT "SupplierDocument_one_recorder";
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_one_recorder" CHECK ((num_nonnulls("recordedByPersonId", "recordedBySupplierAccountId", "recordedByPortalApplicationId") = 1) IS TRUE);

-- ADR 0041 D3, D6: a profile is entered by the supplier's own account or promoted from an online application, exactly one. Every existing row names an account.
ALTER TABLE "CreditorProfile" ADD CONSTRAINT "CreditorProfile_one_enterer" CHECK ((num_nonnulls("enteredBySupplierAccountId", "enteredByPortalApplicationId") = 1) IS TRUE);

-- ADR 0041 D4: an agreement sent with an online application belongs to it. From 20261015100000, with portalApplicationId added.
ALTER TABLE "RegistrationDeclaration" DROP CONSTRAINT "RegistrationDeclaration_has_subject";
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_has_subject" CHECK (("applicationId" IS NOT NULL OR "creditorProfileId" IS NOT NULL OR "portalApplicationId" IS NOT NULL) IS TRUE);
-- Who agreed: a supplier's account (signed), or the applicant of an online application (not signed in). Every existing row names an account.
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_signer" CHECK (("signedBySupplierAccountId" IS NOT NULL OR "portalApplicationId" IS NOT NULL) IS TRUE);
-- The Personal Data Notice is agreed by the TERMS tick, so its hash and frozen text are on a TERMS row and on no other. No existing row is a TERMS row.
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_notice_on_terms" CHECK (
  (("kind" = 'TERMS_AND_CONDITIONS') = ("noticeSha256" IS NOT NULL AND "noticeFrozenEn" IS NOT NULL))
  AND ("noticeSha256" IS NULL OR "noticeSha256" ~ '^[0-9a-f]{64}$')
  AND ("noticeFrozenEn" IS NULL OR length(btrim("noticeFrozenEn")) > 0)
  IS TRUE
);

-- ADR 0041 D3: the APPLICANT actor names its application and nothing else. From 20261006190300, keeping COALESCE (an unknown is a refusal),
-- with the new column held null on every other branch.
ALTER TABLE "AuditEntry" DROP CONSTRAINT "AuditEntry_actor_matches_kind";
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actor_matches_kind" CHECK (
  COALESCE(
    (("actorKind" IS NULL) = "unattributed")
    AND (
      ("actorKind" IS NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL AND "actorSessionId" IS NULL AND "actorPortalApplicationId" IS NULL)
      OR ("actorKind" = 'STAFF' AND "actorPersonId" IS NOT NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL AND "actorPortalApplicationId" IS NULL)
      OR ("actorKind" = 'SUPPLIER' AND "actorSupplierAccountId" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSystemLabel" IS NULL AND "actorPortalApplicationId" IS NULL)
      OR ("actorKind" = 'SYSTEM' AND "actorSystemLabel" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSessionId" IS NULL AND "actorPortalApplicationId" IS NULL)
      OR ("actorKind" = 'APPLICANT' AND "actorPortalApplicationId" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL AND "actorSessionId" IS NULL)
    ),
    false
  )
);

-- The new tables' own shape: a rate is a percentage, a token is held only as its hash.
ALTER TABLE "PortalApplicationDocument" ADD CONSTRAINT "PortalApplicationDocument_rate_range" CHECK (("ratePercent" IS NULL OR ("ratePercent" >= 0 AND "ratePercent" <= 100)) IS TRUE);
ALTER TABLE "PortalApplicationDocument" ADD CONSTRAINT "PortalApplicationDocument_verification_pair" CHECK ((
  ("verification" = 'NOT_CHECKED' AND "verifiedByPersonId" IS NULL AND "verifiedOn" IS NULL AND "verifiedAt" IS NULL)
  OR ("verification" <> 'NOT_CHECKED' AND "verifiedByPersonId" IS NOT NULL AND "verifiedOn" IS NOT NULL AND "verifiedAt" IS NOT NULL)
) IS TRUE);
ALTER TABLE "PortalApplicationCreditor" ADD CONSTRAINT "PortalApplicationCreditor_verification_pair" CHECK ((
  ("verification" = 'NOT_CHECKED' AND "verifiedByPersonId" IS NULL AND "verifiedOn" IS NULL AND "verifiedAt" IS NULL)
  OR ("verification" <> 'NOT_CHECKED' AND "verifiedByPersonId" IS NOT NULL AND "verifiedOn" IS NOT NULL AND "verifiedAt" IS NOT NULL)
) IS TRUE);
ALTER TABLE "PortalFormToken" ADD CONSTRAINT "PortalFormToken_shape" CHECK (("tokenSha256" ~ '^[0-9a-f]{64}$' AND "consumedAt" >= "issuedAt") IS TRUE);

-- ------------------------------------------------------------------ triggers (each ENABLE ALWAYS, with its own SQLSTATE: PA036 to PA038)
-- PA010 to PA029 are wave 3b's and PA030 to PA035 are taken, so the plan's labels PA010 to PA013 are the triggers' names here, not their SQLSTATEs.

-- PA036: a held certificate is frozen as sent. Only the officer's verification may change, and the expiry the officer confirms (as verifyDocument allows).
CREATE FUNCTION public."portal_application_document_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'verification' - 'verifiedByPersonId' - 'verifiedOn' - 'verifiedAt' - 'verificationNote' - 'expiresOn')
       = (to_jsonb(OLD) - 'verification' - 'verifiedByPersonId' - 'verifiedOn' - 'verifiedAt' - 'verificationNote' - 'expiresOn') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "PortalApplicationDocument" is refused: a certificate sent with an online application is kept as sent', TG_OP
    USING ERRCODE = 'PA036', HINT = 'ADR 0041 D2. Only the officer''s verification and the expiry the officer confirms may change.';
END
$$;

CREATE TRIGGER "PortalApplicationDocument_frozen" BEFORE UPDATE OR DELETE ON "PortalApplicationDocument" FOR EACH ROW EXECUTE FUNCTION public."portal_application_document_frozen"();
CREATE TRIGGER "PortalApplicationDocument_no_truncate" BEFORE TRUNCATE ON "PortalApplicationDocument" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "PortalApplicationDocument" ENABLE ALWAYS TRIGGER "PortalApplicationDocument_frozen";
ALTER TABLE "PortalApplicationDocument" ENABLE ALWAYS TRIGGER "PortalApplicationDocument_no_truncate";

-- A held certificate's codes are insert-only (PA001, the trail's own refusal).
CREATE TRIGGER "PortalApplicationValue_append_only" BEFORE UPDATE OR DELETE ON "PortalApplicationValue" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "PortalApplicationValue_no_truncate" BEFORE TRUNCATE ON "PortalApplicationValue" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "PortalApplicationValue" ENABLE ALWAYS TRIGGER "PortalApplicationValue_append_only";
ALTER TABLE "PortalApplicationValue" ENABLE ALWAYS TRIGGER "PortalApplicationValue_no_truncate";

-- PA037: the held bank details never change. The officer's verification may change while they stand, and they may be erased once (set aside): every content
-- field to the empty text and erasedAt from null to set, nothing else in the same update. Once erased, nothing changes again. Never deleted.
CREATE FUNCTION public."portal_application_creditor_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  content text[] := ARRAY['beneficiaryName', 'beneficiaryAddress', 'beneficiaryIdentityNo', 'beneficiaryContactPerson', 'beneficiaryTelephone', 'beneficiaryFax', 'beneficiaryTaxRegistrationNo', 'beneficiaryEmail', 'bankCode', 'bankAccountNo', 'bankAccountTypeCode', 'bankSwiftCode', 'bankAddress'];
  verifying text[] := ARRAY['verification', 'verifiedByPersonId', 'verifiedOn', 'verifiedAt', 'verificationNote'];
  k text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."erasedAt" IS NULL THEN
    IF NEW."erasedAt" IS NULL AND (to_jsonb(NEW) - verifying) = (to_jsonb(OLD) - verifying) THEN
      RETURN NEW;
    END IF;
    IF NEW."erasedAt" IS NOT NULL AND (to_jsonb(NEW) - content - 'erasedAt') = (to_jsonb(OLD) - content - 'erasedAt') THEN
      FOREACH k IN ARRAY content LOOP
        IF to_jsonb(NEW) ->> k <> '' THEN
          RAISE EXCEPTION 'UPDATE on "PortalApplicationCreditor" is refused: an erasure blanks every detail'
            USING ERRCODE = 'PA037', HINT = 'ADR 0041 D7. Set aside erases every bank detail at once.';
        END IF;
      END LOOP;
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% on "PortalApplicationCreditor" is refused: bank details sent with an online application are kept as sent', TG_OP
    USING ERRCODE = 'PA037', HINT = 'ADR 0041 O-6. Only the officer''s verification may change, and the details may be erased once when the application is set aside.';
END
$$;

CREATE TRIGGER "PortalApplicationCreditor_frozen" BEFORE UPDATE OR DELETE ON "PortalApplicationCreditor" FOR EACH ROW EXECUTE FUNCTION public."portal_application_creditor_frozen"();
CREATE TRIGGER "PortalApplicationCreditor_no_truncate" BEFORE TRUNCATE ON "PortalApplicationCreditor" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "PortalApplicationCreditor" ENABLE ALWAYS TRIGGER "PortalApplicationCreditor_frozen";
ALTER TABLE "PortalApplicationCreditor" ENABLE ALWAYS TRIGGER "PortalApplicationCreditor_no_truncate";

-- PA038: a spent token is set to its application once, from null, and nothing else about it changes. Never deleted.
CREATE FUNCTION public."portal_form_token_once"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."portalApplicationId" IS NULL AND NEW."portalApplicationId" IS NOT NULL
     AND (to_jsonb(NEW) - 'portalApplicationId') = (to_jsonb(OLD) - 'portalApplicationId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "PortalFormToken" is refused: a spent form token is kept, and names its application once', TG_OP
    USING ERRCODE = 'PA038', HINT = 'ADR 0041 D8.';
END
$$;

CREATE TRIGGER "PortalFormToken_once" BEFORE UPDATE OR DELETE ON "PortalFormToken" FOR EACH ROW EXECUTE FUNCTION public."portal_form_token_once"();
CREATE TRIGGER "PortalFormToken_no_truncate" BEFORE TRUNCATE ON "PortalFormToken" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "PortalFormToken" ENABLE ALWAYS TRIGGER "PortalFormToken_once";
ALTER TABLE "PortalFormToken" ENABLE ALWAYS TRIGGER "PortalFormToken_no_truncate";
