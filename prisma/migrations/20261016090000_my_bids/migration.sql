-- CreateEnum
CREATE TYPE "TenderViewKind" AS ENUM ('TABLE_DOCUMENT', 'PACK');

-- AlterTable
ALTER TABLE "AwardPolicy" ADD COLUMN     "debriefIncludesReason" BOOLEAN,
ADD COLUMN     "nonAwardNotices" BOOLEAN,
ADD COLUMN     "nonAwardProvenance" "Provenance";

-- AlterTable
ALTER TABLE "WindowPolicy" ADD COLUMN     "electronicDocumentRelease" BOOLEAN,
ADD COLUMN     "electronicReleaseProvenance" "Provenance";

-- CreateTable
CREATE TABLE "SiteEventRegistration" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "representative" TEXT NOT NULL,
    "registeredBySupplierAccountId" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBySupplierAccountId" TEXT,

    CONSTRAINT "SiteEventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddendumAcknowledgement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "addendumId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "acknowledgedBySupplierAccountId" TEXT NOT NULL,
    "acknowledgedOn" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddendumAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "collectorName" TEXT NOT NULL,
    "requestedBySupplierAccountId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "checks" JSONB NOT NULL,
    "refusedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedBySupplierAccountId" TEXT,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderInspectionEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "TenderViewKind" NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "viewedBySupplierAccountId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderInspectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonAwardNotice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "outcomeText" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL DEFAULT '',
    "policySnapshot" JSONB NOT NULL,
    "issuedOn" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "issuedByPersonId" TEXT NOT NULL,

    CONSTRAINT "NonAwardNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteEventRegistration_supplierId_idx" ON "SiteEventRegistration"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteEventRegistration_eventId_supplierId_key" ON "SiteEventRegistration"("eventId", "supplierId");

-- CreateIndex
CREATE INDEX "AddendumAcknowledgement_supplierId_idx" ON "AddendumAcknowledgement"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "AddendumAcknowledgement_addendumId_supplierId_key" ON "AddendumAcknowledgement"("addendumId", "supplierId");

-- CreateIndex
CREATE INDEX "DocumentRequest_windowId_idx" ON "DocumentRequest"("windowId");

-- CreateIndex
CREATE INDEX "DocumentRequest_supplierId_idx" ON "DocumentRequest"("supplierId");

-- CreateIndex
CREATE INDEX "TenderInspectionEvent_windowId_viewedAt_idx" ON "TenderInspectionEvent"("windowId", "viewedAt");

-- CreateIndex
CREATE INDEX "TenderInspectionEvent_supplierId_idx" ON "TenderInspectionEvent"("supplierId");

-- CreateIndex
CREATE INDEX "NonAwardNotice_awardId_idx" ON "NonAwardNotice"("awardId");

-- CreateIndex
CREATE UNIQUE INDEX "NonAwardNotice_exerciseId_partyId_key" ON "NonAwardNotice"("exerciseId", "partyId");

-- AddForeignKey
ALTER TABLE "SiteEventRegistration" ADD CONSTRAINT "SiteEventRegistration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventRegistration" ADD CONSTRAINT "SiteEventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SiteEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventRegistration" ADD CONSTRAINT "SiteEventRegistration_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventRegistration" ADD CONSTRAINT "SiteEventRegistration_registeredBySupplierAccountId_fkey" FOREIGN KEY ("registeredBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEventRegistration" ADD CONSTRAINT "SiteEventRegistration_endedBySupplierAccountId_fkey" FOREIGN KEY ("endedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumAcknowledgement" ADD CONSTRAINT "AddendumAcknowledgement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumAcknowledgement" ADD CONSTRAINT "AddendumAcknowledgement_addendumId_fkey" FOREIGN KEY ("addendumId") REFERENCES "Addendum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumAcknowledgement" ADD CONSTRAINT "AddendumAcknowledgement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumAcknowledgement" ADD CONSTRAINT "AddendumAcknowledgement_acknowledgedBySupplierAccountId_fkey" FOREIGN KEY ("acknowledgedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_requestedBySupplierAccountId_fkey" FOREIGN KEY ("requestedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_endedBySupplierAccountId_fkey" FOREIGN KEY ("endedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInspectionEvent" ADD CONSTRAINT "TenderInspectionEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInspectionEvent" ADD CONSTRAINT "TenderInspectionEvent_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ExerciseWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInspectionEvent" ADD CONSTRAINT "TenderInspectionEvent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInspectionEvent" ADD CONSTRAINT "TenderInspectionEvent_viewedBySupplierAccountId_fkey" FOREIGN KEY ("viewedBySupplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonAwardNotice" ADD CONSTRAINT "NonAwardNotice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonAwardNotice" ADD CONSTRAINT "NonAwardNotice_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "SourcingExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonAwardNotice" ADD CONSTRAINT "NonAwardNotice_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonAwardNotice" ADD CONSTRAINT "NonAwardNotice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "ExerciseParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonAwardNotice" ADD CONSTRAINT "NonAwardNotice_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Phase 4d (My Bids). What the generated statements above cannot say.
--
-- A sign-up and a request are ended by the supplier, and the ending names the account that made it: both or neither.
-- A request that the pre-sale checks stopped is kept as a refused attempt, and a refused attempt is not also withdrawn.
-- Its checks are a list. A notice carries the policy it was issued under as an object. A version shown is a real version.
ALTER TABLE "SiteEventRegistration" ADD CONSTRAINT "SiteEventRegistration_end_pair" CHECK (("endedAt" IS NULL) = ("endedBySupplierAccountId" IS NULL)) NOT VALID;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_end_pair" CHECK (("endedAt" IS NULL) = ("endedBySupplierAccountId" IS NULL)) NOT VALID;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_refused_or_ended" CHECK (("refusedAt" IS NULL OR "endedAt" IS NULL) IS TRUE) NOT VALID;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_checks_list" CHECK (jsonb_typeof("checks") = 'array') NOT VALID;
ALTER TABLE "NonAwardNotice" ADD CONSTRAINT "NonAwardNotice_policy_object" CHECK (jsonb_typeof("policySnapshot") = 'object') NOT VALID;
ALTER TABLE "TenderInspectionEvent" ADD CONSTRAINT "TenderInspectionEvent_version_positive" CHECK ("documentVersion" > 0) NOT VALID;
-- The tables are new and empty, so there is nothing to judge: validating records that.
ALTER TABLE "SiteEventRegistration" VALIDATE CONSTRAINT "SiteEventRegistration_end_pair";
ALTER TABLE "DocumentRequest" VALIDATE CONSTRAINT "DocumentRequest_end_pair";
ALTER TABLE "DocumentRequest" VALIDATE CONSTRAINT "DocumentRequest_refused_or_ended";
ALTER TABLE "DocumentRequest" VALIDATE CONSTRAINT "DocumentRequest_checks_list";
ALTER TABLE "NonAwardNotice" VALIDATE CONSTRAINT "NonAwardNotice_policy_object";
ALTER TABLE "TenderInspectionEvent" VALIDATE CONSTRAINT "TenderInspectionEvent_version_positive";

-- One request that stands per supplier per window. A withdrawn one and a refused attempt do not count, so a supplier may ask again.
CREATE UNIQUE INDEX "DocumentRequest_one_standing" ON "DocumentRequest"("windowId", "supplierId") WHERE "refusedAt" IS NULL AND "endedAt" IS NULL;

-- Three records the app may only add to: the acknowledgement of an addendum, the inspection log and the notice of non-award. The trigger is the one the trail has
-- ("refuse_trail_change", SQLSTATE PA001), for every login, the owner and a superuser included. TRUNCATE skips row triggers, so each also gets a statement-level
-- refusal. ENABLE ALWAYS keeps both firing when a session sets session_replication_role to replica. The app's login gets no UPDATE, DELETE or TRUNCATE either
-- (src/lib/auth/db-role.ts, run by scripts/db-roles.ts). The tables are new and empty, so no existing row is judged.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line, for each of the three tables
--   DROP TRIGGER "AddendumAcknowledgement_no_truncate" ON "AddendumAcknowledgement"
--   DROP TRIGGER "AddendumAcknowledgement_append_only" ON "AddendumAcknowledgement"
CREATE TRIGGER "AddendumAcknowledgement_append_only" BEFORE UPDATE OR DELETE ON "AddendumAcknowledgement" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "AddendumAcknowledgement_no_truncate" BEFORE TRUNCATE ON "AddendumAcknowledgement" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "AddendumAcknowledgement" ENABLE ALWAYS TRIGGER "AddendumAcknowledgement_append_only";
ALTER TABLE "AddendumAcknowledgement" ENABLE ALWAYS TRIGGER "AddendumAcknowledgement_no_truncate";

CREATE TRIGGER "TenderInspectionEvent_append_only" BEFORE UPDATE OR DELETE ON "TenderInspectionEvent" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "TenderInspectionEvent_no_truncate" BEFORE TRUNCATE ON "TenderInspectionEvent" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "TenderInspectionEvent" ENABLE ALWAYS TRIGGER "TenderInspectionEvent_append_only";
ALTER TABLE "TenderInspectionEvent" ENABLE ALWAYS TRIGGER "TenderInspectionEvent_no_truncate";

CREATE TRIGGER "NonAwardNotice_append_only" BEFORE UPDATE OR DELETE ON "NonAwardNotice" FOR EACH ROW EXECUTE FUNCTION "refuse_trail_change"();
CREATE TRIGGER "NonAwardNotice_no_truncate" BEFORE TRUNCATE ON "NonAwardNotice" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_trail_change"();
ALTER TABLE "NonAwardNotice" ENABLE ALWAYS TRIGGER "NonAwardNotice_append_only";
ALTER TABLE "NonAwardNotice" ENABLE ALWAYS TRIGGER "NonAwardNotice_no_truncate";
