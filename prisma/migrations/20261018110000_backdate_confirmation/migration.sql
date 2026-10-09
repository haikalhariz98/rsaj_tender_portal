-- Phase 5a (ruling item 9 of the Phase 2 rulings, NFR-AUD-006): the person a back-dated signature names as authorising it confirms it, as a signed act of their own.
-- Until then the signer's naming is only a claim, and every screen reads it so. A confirmation is one row for the attribution it confirms, kept for good.
-- No pre-check is needed: the table is new, and the trigger judges only what is written from now on.
-- The refusals carry their own SQLSTATE, as the trail triggers do:
--   PA006  a back-dating is confirmed only by the person named as authorising it, once, and a confirmation is never changed or removed

-- CreateTable
CREATE TABLE "BackdateConfirmation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "confirmedByPersonId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackdateConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackdateConfirmation_attributionId_key" ON "BackdateConfirmation"("attributionId");

-- CreateIndex
CREATE INDEX "BackdateConfirmation_confirmedByPersonId_idx" ON "BackdateConfirmation"("confirmedByPersonId");

-- CreateIndex
CREATE INDEX "BackdateConfirmation_organisationId_confirmedAt_idx" ON "BackdateConfirmation"("organisationId", "confirmedAt");

-- AddForeignKey
ALTER TABLE "BackdateConfirmation" ADD CONSTRAINT "BackdateConfirmation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackdateConfirmation" ADD CONSTRAINT "BackdateConfirmation_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "ActAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackdateConfirmation" ADD CONSTRAINT "BackdateConfirmation_confirmedByPersonId_fkey" FOREIGN KEY ("confirmedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What is written: an act that was back-dated and names an authoriser, the authoriser themselves, in the same organisation. Nothing is ever changed or removed afterwards.
-- ENABLE ALWAYS, so session_replication_role = replica does not switch it off, and it has no bypass: it fails for the table owner too.
CREATE FUNCTION "guard_backdate_confirmation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  att RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% on "BackdateConfirmation" is refused: a confirmation is kept for good', TG_OP
      USING ERRCODE = 'PA006', HINT = 'NFR-AUD-006. A confirmation that was given stays on the record.';
  END IF;
  SELECT "organisationId", "effectiveOn", "backdateAuthorisedByPersonId" INTO att FROM "ActAttribution" WHERE "id" = NEW."attributionId";
  IF NOT FOUND OR att."effectiveOn" IS NULL OR att."backdateAuthorisedByPersonId" IS NULL THEN
    RAISE EXCEPTION 'Confirming a back-dating is refused: that act was not back-dated, or names no one as authorising it'
      USING ERRCODE = 'PA006', HINT = 'NFR-AUD-006.';
  END IF;
  IF att."organisationId" <> NEW."organisationId" THEN
    RAISE EXCEPTION 'Confirming a back-dating is refused: the act belongs to another organisation'
      USING ERRCODE = 'PA006', HINT = 'NFR-AUD-006.';
  END IF;
  IF att."backdateAuthorisedByPersonId" <> NEW."confirmedByPersonId" THEN
    RAISE EXCEPTION 'Confirming a back-dating is refused: only the person named as authorising it confirms it'
      USING ERRCODE = 'PA006', HINT = 'NFR-AUD-006. The signer names the authoriser; the authoriser confirms.';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "BackdateConfirmation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BackdateConfirmation" FOR EACH ROW EXECUTE FUNCTION "guard_backdate_confirmation"();
CREATE TRIGGER "BackdateConfirmation_no_truncate" BEFORE TRUNCATE ON "BackdateConfirmation" FOR EACH STATEMENT EXECUTE FUNCTION "guard_backdate_confirmation"();
ALTER TABLE "BackdateConfirmation" ENABLE ALWAYS TRIGGER "BackdateConfirmation_guard";
ALTER TABLE "BackdateConfirmation" ENABLE ALWAYS TRIGGER "BackdateConfirmation_no_truncate";

-- The notice that asks the named person to confirm: one more kind in STAFF_NOTICE_KINDS (src/lib/inbox/kinds.ts), and a source test holds the latest definition of this CHECK to
-- that list. The CHECK is replaced whole: a kind not listed is refused as before.
ALTER TABLE "StaffNotice" DROP CONSTRAINT "StaffNotice_kind_known";
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO', 'CONTRACTOR_SUBMISSION', 'BACKDATE_TO_CONFIRM')) IS TRUE);
