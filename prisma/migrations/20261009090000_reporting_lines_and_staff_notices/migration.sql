-- Phase 3c (FR-APR-010, 011, 012, 017, 018 and FR-CTE-009): reporting lines, and the staff inbox. Additive: two new tables, empty. No existing row is judged.
-- Every CHECK is wrapped in "IS TRUE" so that an unknown value refuses rather than passes (a CHECK passes on NULL).
-- The list of notice kinds is the closed list in src/lib/inbox/kinds.ts (STAFF_NOTICE_KINDS). A source test holds this file to it, so neither can move alone.
-- A reporting line ships EMPTY (nothing is assumed, nothing is derived from a unit's head): no row for a person on a day is "reporting line not set".
-- A row with no superior records that the person has nobody above them. The one open-ended row per person is a partial unique index.
-- A notice is evidence that something was told to someone, so only readAt may change (once, from empty), and nothing is ever deleted: the trigger is the
-- database's refusal, for any login. TRUNCATE skips row triggers, so the table also has a statement-level refusal. ENABLE ALWAYS keeps both firing when a
-- session sets session_replication_role to replica.
--
-- To reverse (run as the owner, then delete this migration's row from _prisma_migrations), one statement per line
--   DROP TABLE "StaffNotice"
--   DROP TABLE "ReportingLine"
--   DROP FUNCTION "refuse_staff_notice_change"()

-- CreateTable
CREATE TABLE "ReportingLine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "superiorPersonId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "provenance" "Provenance" NOT NULL DEFAULT 'ASSUMED',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffNotice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "recipientPersonId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectEntity" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "occurrence" TEXT NOT NULL DEFAULT '',
    "exerciseId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "raisedByPersonId" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "StaffNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportingLine_organisationId_personId_effectiveFrom_idx" ON "ReportingLine"("organisationId", "personId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ReportingLine_superiorPersonId_idx" ON "ReportingLine"("superiorPersonId");

-- CreateIndex
CREATE INDEX "StaffNotice_recipientPersonId_readAt_raisedAt_idx" ON "StaffNotice"("recipientPersonId", "readAt", "raisedAt");

-- CreateIndex
CREATE INDEX "StaffNotice_organisationId_subjectEntity_subjectId_idx" ON "StaffNotice"("organisationId", "subjectEntity", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffNotice_organisationId_recipientPersonId_kind_subjectEn_key" ON "StaffNotice"("organisationId", "recipientPersonId", "kind", "subjectEntity", "subjectId", "occurrence");

-- AddForeignKey
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_superiorPersonId_fkey" FOREIGN KEY ("superiorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_raisedByPersonId_fkey" FOREIGN KEY ("raisedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A person does not report to themself, and a period runs forwards.
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_not_self" CHECK (("superiorPersonId" IS NULL OR "superiorPersonId" <> "personId") IS TRUE);
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_period_runs_forwards" CHECK (("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom") IS TRUE);

-- One open-ended line per person: a second would leave two superiors on the same day.
CREATE UNIQUE INDEX "ReportingLine_one_open_per_person" ON "ReportingLine"("personId") WHERE "effectiveTo" IS NULL;

-- What a notice is: one of the closed kinds, about a record that is named, opening a path in this application or nowhere.
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_kind_known" CHECK (("kind" IN ('STEP_ESCALATED', 'STEP_MOVED_ON_ABSENCE', 'HOLDER_MARKED_ABSENT', 'ROUTE_RECALLED', 'DELEGATION_RECEIVED', 'MATTER_NOT_CARRIED_MEMO')) IS TRUE);
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_subject_named" CHECK ((length("subjectEntity") > 0 AND length("subjectId") > 0 AND length("title") > 0) IS TRUE);
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_href_is_a_local_path" CHECK (("href" IS NULL OR ("href" LIKE '/%' AND "href" NOT LIKE '//%')) IS TRUE);

CREATE FUNCTION "refuse_staff_notice_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."readAt" IS NULL AND (to_jsonb(NEW) - 'readAt') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'readAt') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on "%" is refused: a notice is evidence and only its first reading is recorded', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'PA001', HINT = 'Phase 3c. A notice is never edited or removed, by any database login.';
END
$$;

CREATE TRIGGER "StaffNotice_guard" BEFORE UPDATE OR DELETE ON "StaffNotice" FOR EACH ROW EXECUTE FUNCTION "refuse_staff_notice_change"();
CREATE TRIGGER "StaffNotice_no_truncate" BEFORE TRUNCATE ON "StaffNotice" FOR EACH STATEMENT EXECUTE FUNCTION "refuse_staff_notice_change"();
ALTER TABLE "StaffNotice" ENABLE ALWAYS TRIGGER "StaffNotice_guard";
ALTER TABLE "StaffNotice" ENABLE ALWAYS TRIGGER "StaffNotice_no_truncate";
