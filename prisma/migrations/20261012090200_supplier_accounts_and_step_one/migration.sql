-- Phase 4a: supplier accounts and sessions (ADR 0034 D2), the step-one columns of the public registration form (FR-VND-001), the dial code on a country, and the contact rule.
-- Every change is additive. Existing rows read as they did: the new text columns are blank, the new day is null, the new setting is not set.
--
-- Pre-check (the SELECT CAST pattern), before the supplier foreign keys are added: nothing yet names a supplier account. The two columns existed without a foreign key
-- while the supplier tables did not, and no code wrote them.
SELECT CAST((SELECT 'Pre-check failed: a one-time code or a sign-in event already names a supplier account, and no supplier account table existed. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "OneTimeCode" WHERE "supplierAccountId" IS NOT NULL) OR EXISTS (SELECT 1 FROM "SignInEvent" WHERE "supplierAccountId" IS NOT NULL)) AS INTEGER);


-- AlterTable
ALTER TABLE "PortalApplication" ADD COLUMN     "addressLine1" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "addressLine2" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bumiputeraClaimCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "incorporatedOn" TIMESTAMP(3),
ADD COLUMN     "postcode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stateCode" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "addressLine1" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "addressLine2" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bumiputeraClaimCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "incorporatedOn" TIMESTAMP(3),
ADD COLUMN     "postcode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "stateCode" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SupplierListValue" ADD COLUMN     "callingCode" TEXT;

-- AlterTable
ALTER TABLE "SupplierPolicy" ADD COLUMN     "contactNeedsEmailAndPhone" BOOLEAN,
ADD COLUMN     "contactRuleProvenance" "Provenance";

-- CreateTable
CREATE TABLE "SupplierAccount" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "loginName" TEXT NOT NULL,
    "loginKey" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountStatus" NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastSignInAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT NOT NULL DEFAULT '',
    "resetNoticePending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSession" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "stepUpAt" TIMESTAMP(3),
    "sourceAddress" TEXT,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "SessionRevokeReason",

    CONSTRAINT "SupplierSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAccount_contactId_key" ON "SupplierAccount"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAccount_loginKey_key" ON "SupplierAccount"("loginKey");

-- CreateIndex
CREATE INDEX "SupplierAccount_organisationId_idx" ON "SupplierAccount"("organisationId");

-- CreateIndex
CREATE INDEX "SupplierAccount_supplierId_idx" ON "SupplierAccount"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierSession_tokenHash_key" ON "SupplierSession"("tokenHash");

-- CreateIndex
CREATE INDEX "SupplierSession_accountId_revokedAt_idx" ON "SupplierSession"("accountId", "revokedAt");

-- CreateIndex
CREATE INDEX "OneTimeCode_supplierAccountId_idx" ON "OneTimeCode"("supplierAccountId");

-- CreateIndex
CREATE INDEX "SignInEvent_supplierAccountId_at_idx" ON "SignInEvent"("supplierAccountId", "at");

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SupplierContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSession" ADD CONSTRAINT "SupplierSession_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSession" ADD CONSTRAINT "SupplierSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInEvent" ADD CONSTRAINT "SignInEvent_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A dial code belongs to a country. It is a plus sign and one to six digits, a validity bound and not a choice of the customer's.
ALTER TABLE "SupplierListValue" ADD CONSTRAINT "SupplierListValue_calling_code_country_only" CHECK ("callingCode" IS NULL OR ("list" = 'COUNTRY' AND "callingCode" ~ '^\+[1-9][0-9]{0,5}$'));

-- A supplier account is the staff account's twin: the sign-in key is the lower-cased name, a disabled account is dated, a count never goes below nothing.
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_login_key_lower" CHECK ("loginName" <> '' AND "loginKey" = lower("loginName"));
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_disabled_dated" CHECK (("status" = 'DISABLED') = ("disabledAt" IS NOT NULL));
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_failed_attempts_nonneg" CHECK ("failedAttempts" >= 0);
ALTER TABLE "SupplierSession" ADD CONSTRAINT "SupplierSession_revocation_whole" CHECK (("revokedAt" IS NULL) = ("revokedReason" IS NULL));

-- An account belongs to the supplier and the organisation its contact belongs to. No CHECK can look across tables, so a trigger holds it, on insert and on any change of the three.
CREATE FUNCTION "guard_supplier_account"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  contact_supplier TEXT;
  contact_organisation TEXT;
BEGIN
  SELECT "supplierId", "organisationId" INTO contact_supplier, contact_organisation FROM "SupplierContact" WHERE "id" = NEW."contactId";
  IF contact_supplier IS NULL OR contact_supplier <> NEW."supplierId" OR contact_organisation <> NEW."organisationId" THEN
    RAISE EXCEPTION 'A supplier account must belong to the supplier and the organisation of its contact.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "SupplierAccount_matches_contact" BEFORE INSERT OR UPDATE OF "contactId", "supplierId", "organisationId" ON "SupplierAccount" FOR EACH ROW EXECUTE FUNCTION "guard_supplier_account"();
