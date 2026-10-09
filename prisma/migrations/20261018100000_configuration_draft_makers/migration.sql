-- Phase 5a (ADR 0034 D15): an evaluation model and a rate schedule are drafted and then issued, and the issuer is not one of the people who made the draft,
-- as for the approval matrix (migration 20261007160000). Who made a draft is one row per person (ConfigurationDraftMaker). Who issued a model is a column.
-- Existing drafts have no maker on record, so none can be issued until someone edits it (the edit puts them on record) and a different person issues it.
-- Nothing already stored is rejected: the trigger judges only an update that puts a draft into force.

-- AlterTable
ALTER TABLE "EvaluationModel" ADD COLUMN     "issuedByPersonId" TEXT;

-- CreateTable
CREATE TABLE "ConfigurationDraftMaker" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationDraftMaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfigurationDraftMaker_organisationId_entity_entityId_idx" ON "ConfigurationDraftMaker"("organisationId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "ConfigurationDraftMaker_personId_idx" ON "ConfigurationDraftMaker"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationDraftMaker_entity_entityId_personId_key" ON "ConfigurationDraftMaker"("entity", "entityId", "personId");

-- AddForeignKey
ALTER TABLE "EvaluationModel" ADD CONSTRAINT "EvaluationModel_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationDraftMaker" ADD CONSTRAINT "ConfigurationDraftMaker_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationDraftMaker" ADD CONSTRAINT "ConfigurationDraftMaker_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The entity is one of the two drafts that are issued in turn. A third is added with its own trigger and this CHECK is widened with it.
ALTER TABLE "ConfigurationDraftMaker" ADD CONSTRAINT "ConfigurationDraftMaker_entity_known" CHECK ("entity" IN ('EvaluationModel', 'RateSchedule'));

-- Issuing: the update that puts a draft into force names the issuer, at least one person is on record as having made the draft, and the issuer is not
-- one of them. Once named, the issuer is never changed. Inserting an issued row is not an issue (a seed or a loader writes history that way).
-- SQLSTATE PA005, as the matrix's.
CREATE FUNCTION "guard_draft_issue"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind text := TG_ARGV[0];
  was_draft boolean := OLD."status"::text = 'DRAFT';
  now_issued boolean := NEW."status"::text = 'ISSUED';
  issuer text := NEW."issuedByPersonId";
  old_issuer text := OLD."issuedByPersonId";
BEGIN
  IF old_issuer IS NOT NULL AND issuer IS DISTINCT FROM old_issuer THEN
    RAISE EXCEPTION 'UPDATE on "%" is refused: who issued it is never changed', kind
      USING ERRCODE = 'PA005';
  END IF;
  IF was_draft AND now_issued THEN
    IF issuer IS NULL THEN
      RAISE EXCEPTION 'Issuing a % is refused: it names no issuer', kind
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. The person who issues it is recorded.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "ConfigurationDraftMaker" WHERE "entity" = kind AND "entityId" = NEW."id") THEN
      RAISE EXCEPTION 'Issuing a % is refused: nobody is on record as having made the draft', kind
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. Someone edits the draft first, and then a different person issues it.';
    END IF;
    IF EXISTS (SELECT 1 FROM "ConfigurationDraftMaker" WHERE "entity" = kind AND "entityId" = NEW."id" AND "personId" = issuer) THEN
      RAISE EXCEPTION 'Issuing a % is refused: the issuer is one of the people who made the draft', kind
        USING ERRCODE = 'PA005', HINT = 'ADR 0034 D15. A second person who did not make it issues it.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "EvaluationModel_issue_guard" BEFORE UPDATE ON "EvaluationModel" FOR EACH ROW EXECUTE FUNCTION "guard_draft_issue"('EvaluationModel');
CREATE TRIGGER "RateSchedule_issue_guard" BEFORE UPDATE ON "RateSchedule" FOR EACH ROW EXECUTE FUNCTION "guard_draft_issue"('RateSchedule');
ALTER TABLE "EvaluationModel" ENABLE ALWAYS TRIGGER "EvaluationModel_issue_guard";
ALTER TABLE "RateSchedule" ENABLE ALWAYS TRIGGER "RateSchedule_issue_guard";
