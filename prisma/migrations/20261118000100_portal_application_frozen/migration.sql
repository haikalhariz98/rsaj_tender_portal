-- Security audit L1 and L3 (2026-10-22), hand-written: triggers only, no table changes.
-- L1: a held certificate's check (PA036) and the held bank details' check (PA037) are made once. The check columns, and the expiry the officer confirms with it,
-- may change only while the row reads NOT_CHECKED. Once checked, the row stands as checked. An update that changes nothing is let through.

CREATE OR REPLACE FUNCTION public."portal_application_document_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'verification' - 'verifiedByPersonId' - 'verifiedOn' - 'verifiedAt' - 'verificationNote' - 'expiresOn')
       = (to_jsonb(OLD) - 'verification' - 'verifiedByPersonId' - 'verifiedOn' - 'verifiedAt' - 'verificationNote' - 'expiresOn')
     AND (OLD."verification" = 'NOT_CHECKED' OR to_jsonb(NEW) = to_jsonb(OLD)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "PortalApplicationDocument" is refused: a certificate sent with an online application is kept as sent, and checked once', TG_OP
    USING ERRCODE = 'PA036', HINT = 'ADR 0041 D2. Only the officer''s check and the expiry the officer confirms may change, once, while the certificate is not yet checked.';
END
$$;

CREATE OR REPLACE FUNCTION public."portal_application_creditor_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  content text[] := ARRAY['beneficiaryName', 'beneficiaryAddress', 'beneficiaryIdentityNo', 'beneficiaryContactPerson', 'beneficiaryTelephone', 'beneficiaryFax', 'beneficiaryTaxRegistrationNo', 'beneficiaryEmail', 'bankCode', 'bankAccountNo', 'bankAccountTypeCode', 'bankSwiftCode', 'bankAddress'];
  verifying text[] := ARRAY['verification', 'verifiedByPersonId', 'verifiedOn', 'verifiedAt', 'verificationNote'];
  k text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."erasedAt" IS NULL THEN
    IF NEW."erasedAt" IS NULL AND (to_jsonb(NEW) - verifying) = (to_jsonb(OLD) - verifying)
       AND (OLD."verification" = 'NOT_CHECKED' OR to_jsonb(NEW) = to_jsonb(OLD)) THEN
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
  RAISE EXCEPTION '% on "PortalApplicationCreditor" is refused: bank details sent with an online application are kept as sent, and checked once', TG_OP
    USING ERRCODE = 'PA037', HINT = 'ADR 0041 O-6. Only the officer''s check may change, once, while the details are not yet checked, and the details may be erased once when the application is set aside.';
END
$$;

-- L3 (PA039): an online application's typed company details, its reference and when and how it came in are kept as sent. The acts that move it (recording, sending,
-- deciding, rejecting, setting aside) change only its status and decision columns. The one change to the typed details is the erasure on set aside: erasedAt from null
-- to set, every typed text to the empty text and the incorporation day to null, all in the same update. Once erased, they stay erased.
CREATE FUNCTION public."portal_application_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  typed text[] := ARRAY['registeredName', 'registrationNo', 'registrationNoKey', 'entityTypeCode', 'countryCode', 'registeredAddress', 'addressLine1', 'addressLine2', 'city', 'postcode', 'stateCode', 'bumiputeraClaimCode', 'companyEmail', 'contactName', 'contactDesignation', 'contactEmail', 'contactPhone'];
  kept text[] := ARRAY['id', 'organisationId', 'reference', 'receivedOn', 'receivedAt', 'form'];
  k text;
BEGIN
  FOREACH k IN ARRAY kept LOOP
    IF (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k) THEN
      RAISE EXCEPTION 'UPDATE on "PortalApplication" is refused: its reference and when and how it came in are kept as received'
        USING ERRCODE = 'PA039', HINT = 'Security audit L3.';
    END IF;
  END LOOP;
  IF NEW."erasedAt" IS NOT NULL AND OLD."erasedAt" IS NULL THEN
    FOREACH k IN ARRAY typed LOOP
      IF to_jsonb(NEW) ->> k <> '' THEN
        RAISE EXCEPTION 'UPDATE on "PortalApplication" is refused: an erasure blanks every typed detail'
          USING ERRCODE = 'PA039', HINT = 'Security audit L3. Set aside erases every typed detail at once.';
      END IF;
    END LOOP;
    IF NEW."incorporatedOn" IS NOT NULL THEN
      RAISE EXCEPTION 'UPDATE on "PortalApplication" is refused: an erasure blanks every typed detail'
        USING ERRCODE = 'PA039', HINT = 'Security audit L3. Set aside erases every typed detail at once.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."erasedAt" IS DISTINCT FROM OLD."erasedAt" THEN
    RAISE EXCEPTION 'UPDATE on "PortalApplication" is refused: an erasure is made once and kept'
      USING ERRCODE = 'PA039', HINT = 'Security audit L3.';
  END IF;
  FOREACH k IN ARRAY typed || ARRAY['incorporatedOn'] LOOP
    IF (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k) THEN
      RAISE EXCEPTION 'UPDATE on "PortalApplication" is refused: the company details are kept as the applicant sent them'
        USING ERRCODE = 'PA039', HINT = 'Security audit L3. Only the status and decision columns change, and the details are erased once on set aside.';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;

CREATE TRIGGER "PortalApplication_frozen" BEFORE UPDATE ON "PortalApplication" FOR EACH ROW EXECUTE FUNCTION public."portal_application_frozen"();
ALTER TABLE "PortalApplication" ENABLE ALWAYS TRIGGER "PortalApplication_frozen";
