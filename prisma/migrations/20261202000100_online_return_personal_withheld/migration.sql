-- PDPA, product owner ruling of 2026-10-24 ("blank at the decision", as go-live N7 did for the return correction): a work indent's online return holds
-- the signatory's and the witness's personal values only until an officer decides it. The verify act has copied them into the award's return by then,
-- and a refused return is lodged again. The five personal fields become nullable (null is the withheld marker, the default stays empty), the page CHECK
-- takes a third, decided-and-withheld arm, and PA048 lets the deciding update null exactly those five on a typed page, and nothing else. No row is written.
-- Down: SET NOT NULL fails once any decided row is withheld, so this folder is reversed only before a decision has withheld one.

-- AlterTable
ALTER TABLE "AwardOnlineReturn" ALTER COLUMN "signatoryName" DROP NOT NULL,
ALTER COLUMN "icNumber" DROP NOT NULL,
ALTER COLUMN "occupation" DROP NOT NULL,
ALTER COLUMN "address" DROP NOT NULL,
ALTER COLUMN "witnessName" DROP NOT NULL;


-- ------------------------------------------------------------------ the page CHECK, replaced whole with a third arm

-- ADR 0045 D1: lodged whole (every field typed, each attestation true), or not at all (a Letter of Acceptance), or decided with the five personal
-- fields withheld (null), the capacity and the three attestations kept. Every existing row satisfies one of the first two arms.
ALTER TABLE "AwardOnlineReturn" DROP CONSTRAINT "AwardOnlineReturn_page_whole";
ALTER TABLE "AwardOnlineReturn" ADD CONSTRAINT "AwardOnlineReturn_page_whole" CHECK ((
  (length(btrim("signatoryName")) > 0 AND length(btrim("icNumber")) > 0 AND length(btrim("occupation")) > 0 AND length(btrim("address")) > 0
   AND length(btrim("capacity")) > 0 AND length(btrim("witnessName")) > 0
   AND "contractorSigned" IS TRUE AND "stampAffixed" IS TRUE AND "witnessSigned" IS TRUE)
  OR ("signatoryName" = '' AND "icNumber" = '' AND "occupation" = '' AND "address" = '' AND "capacity" = '' AND "witnessName" = ''
   AND "contractorSigned" IS NULL AND "stampAffixed" IS NULL AND "witnessSigned" IS NULL)
  OR (("verifiedAt" IS NOT NULL OR "refusedAt" IS NOT NULL)
   AND "signatoryName" IS NULL AND "icNumber" IS NULL AND "occupation" IS NULL AND "address" IS NULL AND "witnessName" IS NULL
   AND length(btrim("capacity")) > 0
   AND "contractorSigned" IS TRUE AND "stampAffixed" IS TRUE AND "witnessSigned" IS TRUE)) IS TRUE);


-- ------------------------------------------------------------------ PA048, replaced whole

-- PA048: an online return is filed under its award's organisation, by a portal account of the award's awardee, undecided. It is never deleted. The one
-- change is its decision, once, from undecided: the verified pair or the refused triple, and in the same update a typed page's five personal fields
-- become null, all of them (PDPA, ruling of 2026-10-24), while a Letter of Acceptance's stay as they are. Nothing else changes, and no other update is
-- let through: withholding an undecided row's values, or giving a withheld value back, is refused. The trigger itself (ENABLE ALWAYS) is not recreated.
CREATE OR REPLACE FUNCTION public."award_online_return_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "Award" w JOIN "SupplierAccount" s ON s."id" = NEW."submittedBySupplierAccountId"
                    WHERE w."id" = NEW."awardId" AND w."organisationId" = NEW."organisationId" AND s."organisationId" = NEW."organisationId"
                      AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId") THEN
      RAISE EXCEPTION 'INSERT on "AwardOnlineReturn" is refused: a return is lodged in its award''s organisation, by an account of the award''s awardee'
        USING ERRCODE = 'PA048', HINT = 'ADR 0045 D1.';
    END IF;
    IF NEW."verifiedAt" IS NOT NULL OR NEW."refusedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT on "AwardOnlineReturn" is refused: a return is lodged undecided, and verified or refused later'
        USING ERRCODE = 'PA048', HINT = 'ADR 0045 D1.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."verifiedAt" IS NULL AND OLD."refusedAt" IS NULL AND (NEW."verifiedAt" IS NOT NULL OR NEW."refusedAt" IS NOT NULL)
     AND (to_jsonb(NEW) - 'verifiedByPersonId' - 'verifiedAt' - 'refusedByPersonId' - 'refusedAt' - 'refusedReason'
          - 'signatoryName' - 'icNumber' - 'occupation' - 'address' - 'witnessName')
       = (to_jsonb(OLD) - 'verifiedByPersonId' - 'verifiedAt' - 'refusedByPersonId' - 'refusedAt' - 'refusedReason'
          - 'signatoryName' - 'icNumber' - 'occupation' - 'address' - 'witnessName') THEN
    IF OLD."capacity" <> '' THEN
      -- A typed page: the decision withholds all five.
      IF NEW."signatoryName" IS NULL AND NEW."icNumber" IS NULL AND NEW."occupation" IS NULL AND NEW."address" IS NULL AND NEW."witnessName" IS NULL THEN
        RETURN NEW;
      END IF;
    ELSIF NEW."signatoryName" IS NOT DISTINCT FROM OLD."signatoryName" AND NEW."icNumber" IS NOT DISTINCT FROM OLD."icNumber"
          AND NEW."occupation" IS NOT DISTINCT FROM OLD."occupation" AND NEW."address" IS NOT DISTINCT FROM OLD."address"
          AND NEW."witnessName" IS NOT DISTINCT FROM OLD."witnessName" THEN
      -- A Letter of Acceptance: the five stay as they are.
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% on "AwardOnlineReturn" is refused: a lodged return is kept as sent, and decided once', TG_OP
    USING ERRCODE = 'PA048', HINT = 'ADR 0045 D1. After a refusal the contractor lodges a new return. A typed page''s personal fields are withheld at the decision, all five.';
END
$$;
