-- Phase 2a (ADR 0034 D8, D12, D15): product permissions, the attribution of acts, the makers of a matrix draft, and the two-person
-- configuration change. Additive: no existing row is changed except one backfill (the drafts of the approval matrix, below).
-- The supplier-account columns of ActAttribution have no foreign key: SupplierAccount arrives in Phase 4a, as OneTimeCode's does.
-- Every CHECK is written so that an unknown (NULL) refuses rather than passes: a CHECK passes on NULL, which migration
-- 20261006190300 had to correct once.

-- AlterTable
ALTER TABLE "AuthorityMatrix" ADD COLUMN     "issuedByPersonId" TEXT,
ADD COLUMN     "makersUnknownAtLanding" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AuthorityMatrixMaker" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorityMatrixMaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "decision" "PermissionDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActAttribution" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "subjectPersonId" TEXT,
    "subjectSupplierAccountId" TEXT,
    "recordedByPersonId" TEXT,
    "recordedBySupplierAccountId" TEXT,
    "recordedBySystemLabel" TEXT,
    "mode" "ActMode" NOT NULL,
    "stepUpAt" TIMESTAMP(3),
    "sessionId" TEXT,
    "paperReference" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationChange" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "ConfigurationChangeKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "status" "ConfigurationChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT NOT NULL DEFAULT '',
    "proposedByPersonId" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByPersonId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ConfigurationChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthorityMatrixMaker_personId_idx" ON "AuthorityMatrixMaker"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityMatrixMaker_matrixId_personId_key" ON "AuthorityMatrixMaker"("matrixId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_organisationId_permissionKey_roleCode_key" ON "RolePermission"("organisationId", "permissionKey", "roleCode");

-- CreateIndex
CREATE INDEX "ActAttribution_organisationId_at_idx" ON "ActAttribution"("organisationId", "at");

-- CreateIndex
CREATE INDEX "ActAttribution_subjectPersonId_idx" ON "ActAttribution"("subjectPersonId");

-- CreateIndex
CREATE INDEX "ActAttribution_recordedByPersonId_idx" ON "ActAttribution"("recordedByPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "ActAttribution_entity_entityId_slot_key" ON "ActAttribution"("entity", "entityId", "slot");

-- CreateIndex
CREATE INDEX "ConfigurationChange_organisationId_status_idx" ON "ConfigurationChange"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ConfigurationChange_organisationId_kind_idx" ON "ConfigurationChange"("organisationId", "kind");

-- AddForeignKey
ALTER TABLE "AuthorityMatrix" ADD CONSTRAINT "AuthorityMatrix_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityMatrixMaker" ADD CONSTRAINT "AuthorityMatrixMaker_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "AuthorityMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityMatrixMaker" ADD CONSTRAINT "AuthorityMatrixMaker_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_recordedByPersonId_fkey" FOREIGN KEY ("recordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationChange" ADD CONSTRAINT "ConfigurationChange_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationChange" ADD CONSTRAINT "ConfigurationChange_proposedByPersonId_fkey" FOREIGN KEY ("proposedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationChange" ADD CONSTRAINT "ConfigurationChange_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------------
-- Hand-appended. Pre-check (the SELECT CAST pattern): the CHECK on AuthorityMatrix below holds for every existing row only if
-- none already names an issuer. The column was added above, so none does. Nothing is changed if one somehow does.
SELECT CAST((SELECT 'Pre-check failed: an approval matrix names an issuer before sign-in existed. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "AuthorityMatrix" WHERE "issuedByPersonId" IS NOT NULL AND "issuedAt" IS NULL)) AS INTEGER);

-- An issuer is named only on an issued matrix.
ALTER TABLE "AuthorityMatrix" ADD CONSTRAINT "AuthorityMatrix_issuer_needs_issue" CHECK ("issuedByPersonId" IS NULL OR "issuedAt" IS NOT NULL);

-- The one backfill (ADR 0034 D15): a draft that exists now was made by someone nobody recorded. It must be adopted before it is issued.
-- Set once, here. A draft made after this migration is false.
UPDATE "AuthorityMatrix" SET "makersUnknownAtLanding" = true WHERE "issuedAt" IS NULL;

-- A permission row names a key and a role.
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_named" CHECK (btrim("permissionKey") <> '' AND btrim("roleCode") <> '');

-- ActAttribution (ADR 0034 D12).
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_named" CHECK (btrim("entity") <> '' AND btrim("entityId") <> '' AND btrim("slot") <> '');
-- Exactly one subject: a person or a supplier account.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_one_subject" CHECK (num_nonnulls("subjectPersonId", "subjectSupplierAccountId") = 1);
-- Exactly one recorder: a person, a supplier account, or the system by label (a demo loader, a fixture, a migration).
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_one_recorder" CHECK (num_nonnulls("recordedByPersonId", "recordedBySupplierAccountId", "recordedBySystemLabel") = 1);
-- SIGNED needs the recorder to be the subject, within the person pair or within the supplier-account pair. COALESCE turns an unknown into a refusal.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_signed_by_subject" CHECK (COALESCE("mode" <> 'SIGNED' OR "recordedByPersonId" = "subjectPersonId" OR "recordedBySupplierAccountId" = "subjectSupplierAccountId", false));
-- RECORDED_ON_BEHALF needs the paper it came from or the reason it was recorded.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_on_behalf_needs_paper" CHECK ("mode" <> 'RECORDED_ON_BEHALF' OR btrim("paperReference") <> '' OR btrim("reason") <> '');
-- The system has no session and gave no password, and says what it is.
ALTER TABLE "ActAttribution" ADD CONSTRAINT "ActAttribution_system_recorder" CHECK ("recordedBySystemLabel" IS NULL OR (btrim("recordedBySystemLabel") <> '' AND "sessionId" IS NULL AND "stepUpAt" IS NULL));

-- ConfigurationChange (ADR 0034 D15): the payload and the snapshot are objects, and the decision is held as the rules say.
ALTER TABLE "ConfigurationChange" ADD CONSTRAINT "ConfigurationChange_objects" CHECK (jsonb_typeof("payload") = 'object' AND jsonb_typeof("before") = 'object');
-- A decision is dated and named exactly when the change is no longer proposed.
ALTER TABLE "ConfigurationChange" ADD CONSTRAINT "ConfigurationChange_decision_held" CHECK (
  ("status" = 'PROPOSED' AND "decidedByPersonId" IS NULL AND "decidedAt" IS NULL)
  OR ("status" <> 'PROPOSED' AND "decidedByPersonId" IS NOT NULL AND "decidedAt" IS NOT NULL)
);
-- Proposer and decider are different Persons (compared by Person, not by account). A withdrawal is the proposer's own.
ALTER TABLE "ConfigurationChange" ADD CONSTRAINT "ConfigurationChange_two_persons" CHECK (COALESCE(
  CASE WHEN "status" IN ('APPLIED', 'DECLINED', 'STALE') THEN "decidedByPersonId" <> "proposedByPersonId"
       WHEN "status" = 'WITHDRAWN' THEN "decidedByPersonId" = "proposedByPersonId"
       ELSE true END, false));
