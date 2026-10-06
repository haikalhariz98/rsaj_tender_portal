-- Sign-in (ADR 0034, Phase 1a): staff accounts, sessions, one-time codes, the security policy and the sign-in log.
-- Per ruling O-1 the log row holds no address: the source address and user agent are in SignInEventDetail. Both tables
-- get their refusal triggers in Phase 1d. Nothing here touches an existing row.

-- CreateTable
CREATE TABLE "StaffAccount" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "loginName" TEXT NOT NULL,
    "loginKey" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "isAdministrator" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountStatus" NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastSignInAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT NOT NULL DEFAULT '',
    "resetNoticePending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
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

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimeCode" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "store" "ActorKind" NOT NULL,
    "staffAccountId" TEXT,
    "supplierAccountId" TEXT,
    "purpose" "CodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "issuedByPersonId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "identityCheck" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneTimeCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityPolicy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "staffIdleMinutes" INTEGER,
    "staffAbsoluteMinutes" INTEGER,
    "supplierIdleMinutes" INTEGER,
    "supplierAbsoluteMinutes" INTEGER,
    "maxConcurrentSessions" INTEGER,
    "concurrentSessionAction" "ConcurrentSessionAction",
    "maxFailedAttempts" INTEGER,
    "lockoutMinutes" INTEGER,
    "addressThrottleAttempts" INTEGER,
    "addressThrottleMinutes" INTEGER,
    "passwordMinLength" INTEGER,
    "resetCodeValidityMinutes" INTEGER,
    "paperSignatureRecording" "PaperSignatureRecording",
    "signInDetailRetentionDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignInEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "store" "ActorKind" NOT NULL,
    "staffAccountId" TEXT,
    "supplierAccountId" TEXT,
    "kind" "SignInEventKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignInEventDetail" (
    "eventId" TEXT NOT NULL,
    "sourceAddress" TEXT,
    "userAgent" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SignInEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_personId_key" ON "StaffAccount"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_loginKey_key" ON "StaffAccount"("loginKey");

-- CreateIndex
CREATE INDEX "StaffAccount_organisationId_idx" ON "StaffAccount"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_accountId_revokedAt_idx" ON "StaffSession"("accountId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeCode_codeHash_key" ON "OneTimeCode"("codeHash");

-- CreateIndex
CREATE INDEX "OneTimeCode_staffAccountId_idx" ON "OneTimeCode"("staffAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityPolicy_organisationId_key" ON "SecurityPolicy"("organisationId");

-- CreateIndex
CREATE INDEX "SignInEvent_staffAccountId_at_idx" ON "SignInEvent"("staffAccountId", "at");

-- CreateIndex
CREATE INDEX "SignInEvent_kind_at_idx" ON "SignInEvent"("kind", "at");

-- CreateIndex
CREATE INDEX "SignInEvent_organisationId_at_idx" ON "SignInEvent"("organisationId", "at");

-- CreateIndex
CREATE INDEX "SignInEventDetail_sourceAddress_idx" ON "SignInEventDetail"("sourceAddress");

-- AddForeignKey
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StaffAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_staffAccountId_fkey" FOREIGN KEY ("staffAccountId") REFERENCES "StaffAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityPolicy" ADD CONSTRAINT "SecurityPolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInEvent" ADD CONSTRAINT "SignInEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInEvent" ADD CONSTRAINT "SignInEvent_staffAccountId_fkey" FOREIGN KEY ("staffAccountId") REFERENCES "StaffAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInEventDetail" ADD CONSTRAINT "SignInEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SignInEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checks the schema cannot say. They hold the rules of ADR 0034 in the database as well as in code.
-- The sign-in key is the lower-cased name. A disabled account is dated and an active one is not.
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_login_key_lower" CHECK ("loginName" <> '' AND "loginKey" = lower("loginName"));
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_disabled_dated" CHECK (("status" = 'DISABLED') = ("disabledAt" IS NOT NULL));
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_failed_attempts_nonneg" CHECK ("failedAttempts" >= 0);

-- A session ends once: a revocation has both its time and its reason.
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_revocation_whole" CHECK (("revokedAt" IS NULL) = ("revokedReason" IS NULL));

-- A code belongs to exactly one account in exactly one store. The supplier account has no foreign key until Phase 4.
-- The system never signs in, so it is not a store.
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_one_account" CHECK (num_nonnulls("staffAccountId", "supplierAccountId") = 1);
ALTER TABLE "OneTimeCode" ADD CONSTRAINT "OneTimeCode_store_matches_account" CHECK (("store" = 'STAFF' AND "staffAccountId" IS NOT NULL) OR ("store" = 'SUPPLIER' AND "supplierAccountId" IS NOT NULL));
ALTER TABLE "SignInEvent" ADD CONSTRAINT "SignInEvent_store_matches_account" CHECK (("store" = 'STAFF' AND "supplierAccountId" IS NULL) OR ("store" = 'SUPPLIER' AND "staffAccountId" IS NULL));

-- Every setting is nullable (unset means sign-in refuses and says so), and each has a validity range. The ranges are
-- bounds that keep a typing mistake out, not policy: nothing here says what a customer should choose.
ALTER TABLE "SecurityPolicy" ADD CONSTRAINT "SecurityPolicy_ranges" CHECK (
  ("staffIdleMinutes" IS NULL OR "staffIdleMinutes" BETWEEN 1 AND 10080)
  AND ("staffAbsoluteMinutes" IS NULL OR "staffAbsoluteMinutes" BETWEEN 1 AND 43200)
  AND ("supplierIdleMinutes" IS NULL OR "supplierIdleMinutes" BETWEEN 1 AND 10080)
  AND ("supplierAbsoluteMinutes" IS NULL OR "supplierAbsoluteMinutes" BETWEEN 1 AND 43200)
  AND ("maxConcurrentSessions" IS NULL OR "maxConcurrentSessions" BETWEEN 1 AND 100)
  AND ("maxFailedAttempts" IS NULL OR "maxFailedAttempts" BETWEEN 1 AND 100)
  AND ("lockoutMinutes" IS NULL OR "lockoutMinutes" BETWEEN 1 AND 10080)
  AND ("addressThrottleAttempts" IS NULL OR "addressThrottleAttempts" BETWEEN 1 AND 10000)
  AND ("addressThrottleMinutes" IS NULL OR "addressThrottleMinutes" BETWEEN 1 AND 10080)
  AND ("passwordMinLength" IS NULL OR "passwordMinLength" BETWEEN 8 AND 256)
  AND ("resetCodeValidityMinutes" IS NULL OR "resetCodeValidityMinutes" BETWEEN 1 AND 10080)
  AND ("signInDetailRetentionDays" IS NULL OR "signInDetailRetentionDays" BETWEEN 1 AND 3650)
);
-- An idle limit longer than the absolute limit would never be reached.
ALTER TABLE "SecurityPolicy" ADD CONSTRAINT "SecurityPolicy_idle_within_absolute" CHECK (
  ("staffIdleMinutes" IS NULL OR "staffAbsoluteMinutes" IS NULL OR "staffIdleMinutes" <= "staffAbsoluteMinutes")
  AND ("supplierIdleMinutes" IS NULL OR "supplierAbsoluteMinutes" IS NULL OR "supplierIdleMinutes" <= "supplierAbsoluteMinutes")
);
-- O-1: the sign-in detail is kept at least as long as the address throttle looks back, or the throttle would lose its own evidence.
ALTER TABLE "SecurityPolicy" ADD CONSTRAINT "SecurityPolicy_detail_retention_covers_throttle" CHECK (
  "signInDetailRetentionDays" IS NULL OR "addressThrottleMinutes" IS NULL OR "signInDetailRetentionDays" * 1440 >= "addressThrottleMinutes"
);
