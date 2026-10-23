-- ADR 0042 D10 (plan project-workspace-simple-plan.md step 7 section 8.2, PW-18, PW-29): the contract's one kick-off meeting and who attended it, and the index the
-- portal upload's rolling window reads (PW-32, owed from step 5). Additive only: two new tables, one new index, and the triggers that keep the new rows.
-- No existing row is written, changed or deleted. The DocumentVersion index is built in the migration's transaction (Prisma cannot run CONCURRENTLY there),
-- so writes to that table wait while it builds.

-- CreateTable
CREATE TABLE "KickOffMeeting" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "meetsAt" TIMESTAMP(3) NOT NULL,
    "place" TEXT NOT NULL DEFAULT '',
    "onlineLink" TEXT NOT NULL DEFAULT '',
    "agenda" TEXT NOT NULL,
    "scheduledByPersonId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "heldOn" TIMESTAMP(3),
    "heldRecordedByPersonId" TEXT,
    "heldRecordedAt" TIMESTAMP(3),
    "minutesDocumentId" TEXT,

    CONSTRAINT "KickOffMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KickOffAttendance" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "side" "ProjectSide",
    "personId" TEXT,
    "supplierAccountId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "KickOffAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KickOffMeeting_contractId_key" ON "KickOffMeeting"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "KickOffMeeting_minutesDocumentId_key" ON "KickOffMeeting"("minutesDocumentId");

-- CreateIndex
CREATE INDEX "KickOffAttendance_meetingId_idx" ON "KickOffAttendance"("meetingId");

-- CreateIndex
CREATE INDEX "DocumentVersion_recordedBySupplierAccountId_storedAt_idx" ON "DocumentVersion"("recordedBySupplierAccountId", "storedAt");

-- AddForeignKey
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_scheduledByPersonId_fkey" FOREIGN KEY ("scheduledByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_heldRecordedByPersonId_fkey" FOREIGN KEY ("heldRecordedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_minutesDocumentId_fkey" FOREIGN KEY ("minutesDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "KickOffMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------ CHECKs and partial indexes of the new tables

-- PW-18: a meeting meets somewhere, a place or a plain-text online link, or both.
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_place_or_link" CHECK ((length(btrim("place")) > 0 OR length(btrim("onlineLink")) > 0) IS TRUE);
-- PW-18: a meeting is scheduled with an agenda (the pure AGENDA_REQUIRED, held here too).
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_agenda" CHECK ((length(btrim("agenda")) > 0) IS TRUE);
-- PW-29: held is one act. The day, who recorded it, when, and the minutes are all set together, or none is.
ALTER TABLE "KickOffMeeting" ADD CONSTRAINT "KickOffMeeting_held_together" CHECK ((num_nonnulls("heldOn", "heldRecordedByPersonId", "heldRecordedAt", "minutesDocumentId") IN (0, 4)) IS TRUE);

-- PW-18: an attendee is a staff person on the organisation's side, a portal account on the contractor's, or another name on neither side.
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_one_attendee" CHECK ((num_nonnulls("personId", "supplierAccountId") <= 1) IS TRUE);
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_person_organisation" CHECK (("personId" IS NULL OR "side" = 'ORGANISATION') IS TRUE);
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_account_contractor" CHECK (("supplierAccountId" IS NULL OR "side" = 'CONTRACTOR') IS TRUE);
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_side_named" CHECK ((("personId" IS NULL AND "supplierAccountId" IS NULL) = ("side" IS NULL)) IS TRUE);
ALTER TABLE "KickOffAttendance" ADD CONSTRAINT "KickOffAttendance_other_name" CHECK (("personId" IS NOT NULL OR "supplierAccountId" IS NOT NULL OR length(btrim("name")) > 0) IS TRUE);
-- A person or an account is ticked once per meeting. Two other names may be the same words, so they are not held unique.
CREATE UNIQUE INDEX "KickOffAttendance_one_per_person" ON "KickOffAttendance"("meetingId", "personId") WHERE "personId" IS NOT NULL;
CREATE UNIQUE INDEX "KickOffAttendance_one_per_account" ON "KickOffAttendance"("meetingId", "supplierAccountId") WHERE "supplierAccountId" IS NOT NULL;

-- ------------------------------------------------------------------ triggers (each ENABLE ALWAYS, with its own SQLSTATE: PA045 and PA046)
-- The act's guarded write comes first. These are the backstop, for every database login. A plain change or removal of an attendance row is refused by
-- the trail's own function (PA001). TRUNCATE skips row triggers, so each table also refuses TRUNCATE.
-- The xmin of a row equals pg_current_xact_id()::xid exactly when this transaction wrote that row version: that is how "in the same act" is read here,
-- as in 20261103110000. A row written inside a savepoint carries the savepoint's own xid, so the record-held act writes at the transaction's top level.

-- PA045: a meeting is never deleted. It is filed under its contract's organisation and inserted not yet held. While it is not held, an update either
-- changes only when, where and the agenda, or sets only the four held columns (the CHECK sets them together). The minutes are an ORGANISATION document
-- of the same contract, made in the same act, with a version, no live approver and no version kept from the contractor (shared for information).
-- Once held, nothing changes.
CREATE FUNCTION public."kick_off_meeting_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "Contract" c WHERE c."id" = NEW."contractId" AND c."organisationId" = NEW."organisationId") THEN
      RAISE EXCEPTION 'INSERT on "KickOffMeeting" is refused: a meeting is filed under its contract''s own organisation'
        USING ERRCODE = 'PA045', HINT = 'ADR 0042 D10.';
    END IF;
    IF NEW."heldOn" IS NOT NULL THEN
      RAISE EXCEPTION 'INSERT on "KickOffMeeting" is refused: a meeting is scheduled first, and recorded as held later'
        USING ERRCODE = 'PA045', HINT = 'ADR 0042 D10 (PW-18).';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."heldOn" IS NULL THEN
    IF (to_jsonb(NEW) - 'meetsAt' - 'place' - 'onlineLink' - 'agenda') = (to_jsonb(OLD) - 'meetsAt' - 'place' - 'onlineLink' - 'agenda') THEN
      RETURN NEW;
    END IF;
    IF NEW."heldOn" IS NOT NULL
       AND (to_jsonb(NEW) - 'heldOn' - 'heldRecordedByPersonId' - 'heldRecordedAt' - 'minutesDocumentId') = (to_jsonb(OLD) - 'heldOn' - 'heldRecordedByPersonId' - 'heldRecordedAt' - 'minutesDocumentId') THEN
      IF NOT EXISTS (SELECT 1 FROM "ProjectDocument" d
                      WHERE d."id" = NEW."minutesDocumentId" AND d."contractId" = NEW."contractId" AND d."organisationId" = NEW."organisationId"
                        AND d."side" = 'ORGANISATION' AND d."xmin" = pg_current_xact_id()::xid) THEN
        RAISE EXCEPTION 'UPDATE on "KickOffMeeting" is refused: the minutes are an organisation document of the same contract, made in the act that records the meeting held'
          USING ERRCODE = 'PA045', HINT = 'ADR 0042 D10 (PW-29).';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM "ProjectDocumentVersion" v WHERE v."documentId" = NEW."minutesDocumentId")
         OR EXISTS (SELECT 1 FROM "ProjectDocumentVersion" v WHERE v."documentId" = NEW."minutesDocumentId" AND NOT v."noApproversAtUpload")
         OR EXISTS (SELECT 1 FROM "ProjectDocumentApprover" a WHERE a."documentId" = NEW."minutesDocumentId" AND a."removedAt" IS NULL) THEN
        RAISE EXCEPTION 'UPDATE on "KickOffMeeting" is refused: the minutes have a version, no approver, and are shared with the contractor at once'
          USING ERRCODE = 'PA045', HINT = 'ADR 0042 D10 (PW-29). The minutes are shared for information.';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% on "KickOffMeeting" is refused: a meeting is kept, changed only before it is held, and then frozen', TG_OP
    USING ERRCODE = 'PA045', HINT = 'ADR 0042 D10 (PW-18).';
END
$$;

-- PA045, at commit: a meeting recorded as held names who attended (PW-18). The attendance rows follow the held columns in the same act, so this is
-- checked when the transaction commits.
CREATE FUNCTION public."kick_off_meeting_held_has_attendance"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW."heldOn" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "KickOffAttendance" k WHERE k."meetingId" = NEW."id") THEN
    RAISE EXCEPTION 'UPDATE on "KickOffMeeting" is refused: a meeting recorded as held names who attended'
      USING ERRCODE = 'PA045', HINT = 'ADR 0042 D10 (PW-18).';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "KickOffMeeting_guard" BEFORE INSERT OR UPDATE OR DELETE ON "KickOffMeeting" FOR EACH ROW EXECUTE FUNCTION public."kick_off_meeting_guard"();
CREATE TRIGGER "KickOffMeeting_no_truncate" BEFORE TRUNCATE ON "KickOffMeeting" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
CREATE CONSTRAINT TRIGGER "KickOffMeeting_held_has_attendance" AFTER UPDATE OF "heldOn" ON "KickOffMeeting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."heldOn" IS NULL AND NEW."heldOn" IS NOT NULL) EXECUTE FUNCTION public."kick_off_meeting_held_has_attendance"();
ALTER TABLE "KickOffMeeting" ENABLE ALWAYS TRIGGER "KickOffMeeting_guard";
ALTER TABLE "KickOffMeeting" ENABLE ALWAYS TRIGGER "KickOffMeeting_no_truncate";
ALTER TABLE "KickOffMeeting" ENABLE ALWAYS TRIGGER "KickOffMeeting_held_has_attendance";

-- PA046: attendance is written once, with the held record: its meeting is held, by this same transaction, in the same organisation. A person ticked is
-- the organisation's, and an account ticked is the awardee's (the contractor's side, PW-17).
CREATE FUNCTION public."kick_off_attendance_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  meeting_org text;
  meeting_contract text;
  held_now boolean;
BEGIN
  SELECT m."organisationId", m."contractId", (m."heldOn" IS NOT NULL AND m."xmin" = pg_current_xact_id()::xid)
    INTO meeting_org, meeting_contract, held_now FROM "KickOffMeeting" m WHERE m."id" = NEW."meetingId";
  IF meeting_org IS DISTINCT FROM NEW."organisationId" THEN
    RAISE EXCEPTION 'INSERT on "KickOffAttendance" is refused: attendance is filed under its meeting''s organisation'
      USING ERRCODE = 'PA046', HINT = 'ADR 0042 D10.';
  END IF;
  IF NOT held_now THEN
    RAISE EXCEPTION 'INSERT on "KickOffAttendance" is refused: attendance is written once, in the act that records the meeting held'
      USING ERRCODE = 'PA046', HINT = 'ADR 0042 D10 (PW-18, PW-29).';
  END IF;
  IF NEW."personId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Person" p WHERE p."id" = NEW."personId" AND p."organisationId" = NEW."organisationId") THEN
    RAISE EXCEPTION 'INSERT on "KickOffAttendance" is refused: a person ticked on the organisation''s side is the organisation''s'
      USING ERRCODE = 'PA046', HINT = 'ADR 0042 D10 (PW-18).';
  END IF;
  IF NEW."supplierAccountId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "SupplierAccount" s JOIN "Contract" c ON c."id" = meeting_contract JOIN "Award" w ON w."id" = c."awardId"
        WHERE s."id" = NEW."supplierAccountId" AND s."organisationId" = NEW."organisationId" AND w."vendorId" IS NOT NULL AND s."supplierId" = w."vendorId") THEN
    RAISE EXCEPTION 'INSERT on "KickOffAttendance" is refused: an account ticked on the contractor''s side is the awardee''s'
      USING ERRCODE = 'PA046', HINT = 'ADR 0042 D10 (PW-17, PW-18).';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "KickOffAttendance_insert" BEFORE INSERT ON "KickOffAttendance" FOR EACH ROW EXECUTE FUNCTION public."kick_off_attendance_insert"();
CREATE TRIGGER "KickOffAttendance_append_only" BEFORE UPDATE OR DELETE ON "KickOffAttendance" FOR EACH ROW EXECUTE FUNCTION public."refuse_trail_change"();
CREATE TRIGGER "KickOffAttendance_no_truncate" BEFORE TRUNCATE ON "KickOffAttendance" FOR EACH STATEMENT EXECUTE FUNCTION public."refuse_trail_change"();
ALTER TABLE "KickOffAttendance" ENABLE ALWAYS TRIGGER "KickOffAttendance_insert";
ALTER TABLE "KickOffAttendance" ENABLE ALWAYS TRIGGER "KickOffAttendance_append_only";
ALTER TABLE "KickOffAttendance" ENABLE ALWAYS TRIGGER "KickOffAttendance_no_truncate";
