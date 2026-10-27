-- Phase 2 close-out stage B (ADR 0047 D1, D3, plan closeout-plan.md section 6.2): the practical completion certificate's record, the
-- live defect lines and what happened to each, the Schedule of Defects, the certificate of making good defects and the return of
-- securities. No sections (ruling 20). CHECKs and triggers by hand below.

-- CreateEnum
CREATE TYPE "DefectSource" AS ENUM ('PRACTICAL_COMPLETION', 'LIABILITY_PERIOD');

-- CreateEnum
CREATE TYPE "DefectEventKind" AS ENUM ('REPORTED_RECTIFIED', 'MADE_GOOD', 'RETURNED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SecurityReleaseTrigger" AS ENUM ('MAKING_GOOD', 'FINAL_PAYMENT', 'ADVANCE_RECOUPED');

-- CreateTable
CREATE TABLE "PracticalCompletion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "completionDate" TIMESTAMP(3) NOT NULL,
    "possessionTakenOn" TIMESTAMP(3) NOT NULL,
    "inspectedOn" TIMESTAMP(3) NOT NULL,
    "attendees" TEXT[],
    "testReasons" TEXT NOT NULL,
    "dlpMonths" INTEGER,
    "dlpStart" TIMESTAMP(3),
    "dlpEnd" TIMESTAMP(3),
    "frozenLines" JSONB,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticalCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "source" "DefectSource" NOT NULL,
    "practicalCompletionId" TEXT,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "dueOn" TIMESTAMP(3) NOT NULL,
    "reportedByPersonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefectItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "kind" "DefectEventKind" NOT NULL,
    "on" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "evidenceDocumentId" TEXT,
    "personId" TEXT,
    "supplierAccountId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectSchedule" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "rectifyBy" TIMESTAMP(3) NOT NULL,
    "frozenLines" JSONB,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefectSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakingGood" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "madeGoodOn" TIMESTAMP(3) NOT NULL,
    "finalInspectionOn" TIMESTAMP(3) NOT NULL,
    "frozenLines" JSONB,
    "snapshot" JSONB,
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MakingGood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRelease" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "trigger" "SecurityReleaseTrigger" NOT NULL,
    "certificateId" TEXT,
    "returnedOn" TIMESTAMP(3) NOT NULL,
    "officialReceiptRef" TEXT NOT NULL DEFAULT '',
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticalCompletion_certificateId_key" ON "PracticalCompletion"("certificateId");

-- CreateIndex
CREATE INDEX "PracticalCompletion_contractId_idx" ON "PracticalCompletion"("contractId");

-- CreateIndex
CREATE INDEX "DefectItem_contractId_idx" ON "DefectItem"("contractId");

-- CreateIndex
CREATE INDEX "DefectItem_practicalCompletionId_idx" ON "DefectItem"("practicalCompletionId");

-- CreateIndex
CREATE INDEX "DefectEvent_defectId_idx" ON "DefectEvent"("defectId");

-- CreateIndex
CREATE UNIQUE INDEX "DefectSchedule_certificateId_key" ON "DefectSchedule"("certificateId");

-- CreateIndex
CREATE INDEX "DefectSchedule_contractId_idx" ON "DefectSchedule"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "MakingGood_certificateId_key" ON "MakingGood"("certificateId");

-- CreateIndex
CREATE INDEX "MakingGood_contractId_idx" ON "MakingGood"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityRelease_securityId_key" ON "SecurityRelease"("securityId");

-- CreateIndex
CREATE INDEX "SecurityRelease_contractId_idx" ON "SecurityRelease"("contractId");

-- AddForeignKey
ALTER TABLE "PracticalCompletion" ADD CONSTRAINT "PracticalCompletion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalCompletion" ADD CONSTRAINT "PracticalCompletion_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalCompletion" ADD CONSTRAINT "PracticalCompletion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalCompletion" ADD CONSTRAINT "PracticalCompletion_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_practicalCompletionId_fkey" FOREIGN KEY ("practicalCompletionId") REFERENCES "PracticalCompletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_reportedByPersonId_fkey" FOREIGN KEY ("reportedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "DefectItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectSchedule" ADD CONSTRAINT "DefectSchedule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectSchedule" ADD CONSTRAINT "DefectSchedule_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectSchedule" ADD CONSTRAINT "DefectSchedule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectSchedule" ADD CONSTRAINT "DefectSchedule_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakingGood" ADD CONSTRAINT "MakingGood_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakingGood" ADD CONSTRAINT "MakingGood_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakingGood" ADD CONSTRAINT "MakingGood_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakingGood" ADD CONSTRAINT "MakingGood_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityRelease" ADD CONSTRAINT "SecurityRelease_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityRelease" ADD CONSTRAINT "SecurityRelease_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "SecurityInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityRelease" ADD CONSTRAINT "SecurityRelease_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityRelease" ADD CONSTRAINT "SecurityRelease_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityRelease" ADD CONSTRAINT "SecurityRelease_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ------------------------------------------------------------------ by hand: CHECKs

-- The defects liability period frozen on the CPC: both days or neither, the end after the start (CO-5)
ALTER TABLE "PracticalCompletion" ADD CONSTRAINT "PracticalCompletion_dlp" CHECK (("dlpStart" IS NULL AND "dlpEnd" IS NULL) OR ("dlpStart" IS NOT NULL AND "dlpEnd" IS NOT NULL AND "dlpEnd" > "dlpStart"));

-- A line on the CPC's list names its CPC, a line reported during the period names none, and every line says what it is
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_source" CHECK (("source" = 'PRACTICAL_COMPLETION') = ("practicalCompletionId" IS NOT NULL));
ALTER TABLE "DefectItem" ADD CONSTRAINT "DefectItem_description" CHECK (btrim("description") <> '');

-- Exactly one actor, the contractor's account only ever reports a line rectified, and a return or a withdrawal says why
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_one_actor" CHECK (("personId" IS NULL) <> ("supplierAccountId" IS NULL));
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_supplier_reports" CHECK ("supplierAccountId" IS NULL OR "kind" = 'REPORTED_RECTIFIED');
ALTER TABLE "DefectEvent" ADD CONSTRAINT "DefectEvent_note" CHECK ("kind" NOT IN ('RETURNED', 'WITHDRAWN') OR btrim("note") <> '');

-- ------------------------------------------------------------------ by hand: triggers

-- A defect line is never changed. A line on the CPC's list is added or removed only while that certificate is a draft, and a line
-- reported during the period is never removed (ADR 0047 D1). What happened to a line is a DefectEvent.
CREATE FUNCTION public."defect_item_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_pc text;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'UPDATE on "DefectItem" is refused: a defect line is never changed, what happens to it is a DefectEvent'
      USING ERRCODE = 'PA053', HINT = 'ADR 0047 D1.';
  END IF;
  v_pc := CASE WHEN TG_OP = 'INSERT' THEN NEW."practicalCompletionId" ELSE OLD."practicalCompletionId" END;
  IF v_pc IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'DELETE on "DefectItem" is refused: a line reported during the defects liability period is kept'
        USING ERRCODE = 'PA053', HINT = 'ADR 0047 D1. An officer withdraws it with a reason.';
    END IF;
    RETURN NEW;
  END IF;
  SELECT c."status"::text INTO v_status FROM "PracticalCompletion" p JOIN "Certificate" c ON c."id" = p."certificateId" WHERE p."id" = v_pc;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION '% on "DefectItem" is refused: a line on the practical completion certificate''s list changes only while the certificate is a draft', TG_OP
      USING ERRCODE = 'PA053', HINT = 'ADR 0047 D1, ADR 0008.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "DefectItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "DefectItem" FOR EACH ROW EXECUTE FUNCTION public."defect_item_guard"();
CREATE TRIGGER "DefectItem_no_truncate" BEFORE TRUNCATE ON "DefectItem" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "DefectItem" ENABLE ALWAYS TRIGGER "DefectItem_guard";
ALTER TABLE "DefectItem" ENABLE ALWAYS TRIGGER "DefectItem_no_truncate";

-- What happened to a line is append-only (ADR 0047 D1)
CREATE TRIGGER "DefectEvent_append_only" BEFORE UPDATE OR DELETE ON "DefectEvent" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "DefectEvent_no_truncate" BEFORE TRUNCATE ON "DefectEvent" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "DefectEvent" ENABLE ALWAYS TRIGGER "DefectEvent_append_only";
ALTER TABLE "DefectEvent" ENABLE ALWAYS TRIGGER "DefectEvent_no_truncate";
