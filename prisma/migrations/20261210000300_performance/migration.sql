-- Phase 2 close-out stage D (ADR 0047 D6, plan closeout-plan.md section 6.2, rulings 10, 17, 20): the contractor performance form, one per
-- contract type with no general fallback, and the one report per contract, scored, assessed and verified by a different person. Shipped
-- empty. CHECKs and triggers by hand below.


-- CreateEnum
CREATE TYPE "PerformanceFormStatus" AS ENUM ('DRAFT', 'ISSUED', 'RETIRED');

-- CreateTable
CREATE TABLE "PerformanceForm" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "contractTypeCode" TEXT NOT NULL,
    "scaleMax" INTEGER NOT NULL,
    "status" "PerformanceFormStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedByPersonId" TEXT,
    "provenance" "Provenance" NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "retiredOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceCriterion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "labelEn" TEXT NOT NULL,
    "guideEn" TEXT NOT NULL DEFAULT '',
    "weight" DECIMAL(9,4) NOT NULL,

    CONSTRAINT "PerformanceCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGradeBand" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lowerPct" DECIMAL(9,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PerformanceGradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReport" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "supplierId" TEXT,
    "formId" TEXT NOT NULL,
    "formSnapshot" JSONB NOT NULL,
    "scoreTotal" DECIMAL(9,4),
    "gradeLabel" TEXT,
    "assessedByPersonId" TEXT,
    "assessedAt" TIMESTAMP(3),
    "verifiedByPersonId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "personId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceScore" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "criterionOrder" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PerformanceScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceForm_organisationId_contractTypeCode_version_key" ON "PerformanceForm"("organisationId", "contractTypeCode", "version");

-- CreateIndex
CREATE INDEX "PerformanceCriterion_formId_idx" ON "PerformanceCriterion"("formId");

-- CreateIndex
CREATE INDEX "PerformanceGradeBand_formId_idx" ON "PerformanceGradeBand"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReport_contractId_key" ON "PerformanceReport"("contractId");

-- CreateIndex
CREATE INDEX "PerformanceReport_supplierId_idx" ON "PerformanceReport"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceScore_reportId_criterionOrder_key" ON "PerformanceScore"("reportId", "criterionOrder");

-- AddForeignKey
ALTER TABLE "PerformanceForm" ADD CONSTRAINT "PerformanceForm_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceForm" ADD CONSTRAINT "PerformanceForm_issuedByPersonId_fkey" FOREIGN KEY ("issuedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceCriterion" ADD CONSTRAINT "PerformanceCriterion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceCriterion" ADD CONSTRAINT "PerformanceCriterion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "PerformanceForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGradeBand" ADD CONSTRAINT "PerformanceGradeBand_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGradeBand" ADD CONSTRAINT "PerformanceGradeBand_formId_fkey" FOREIGN KEY ("formId") REFERENCES "PerformanceForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_formId_fkey" FOREIGN KEY ("formId") REFERENCES "PerformanceForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_assessedByPersonId_fkey" FOREIGN KEY ("assessedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_verifiedByPersonId_fkey" FOREIGN KEY ("verifiedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScore" ADD CONSTRAINT "PerformanceScore_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScore" ADD CONSTRAINT "PerformanceScore_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "PerformanceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ------------------------------------------------------------------ by hand: CHECKs

-- The scale runs 2 to 10 (ruling 10). An issued or retired form says when it was issued, and only a retired one has a retirement day
ALTER TABLE "PerformanceForm" ADD CONSTRAINT "PerformanceForm_scale" CHECK ("scaleMax" BETWEEN 2 AND 10);
ALTER TABLE "PerformanceForm" ADD CONSTRAINT "PerformanceForm_issued" CHECK ("status" = 'DRAFT' OR "issuedAt" IS NOT NULL);
ALTER TABLE "PerformanceForm" ADD CONSTRAINT "PerformanceForm_retired" CHECK (("status" = 'RETIRED') = ("retiredOn" IS NOT NULL));
ALTER TABLE "PerformanceForm" ADD CONSTRAINT "PerformanceForm_type" CHECK (btrim("contractTypeCode") <> '');

-- A weight is above nothing and at most the whole. A band starts between 0 and 100. A score is at least 1 (the act holds it to the form's scale)
ALTER TABLE "PerformanceCriterion" ADD CONSTRAINT "PerformanceCriterion_weight" CHECK ("weight" > 0 AND "weight" <= 1);
ALTER TABLE "PerformanceGradeBand" ADD CONSTRAINT "PerformanceGradeBand_lower" CHECK ("lowerPct" >= 0 AND "lowerPct" <= 100);
ALTER TABLE "PerformanceScore" ADD CONSTRAINT "PerformanceScore_score" CHECK ("score" BETWEEN 1 AND 10);

-- Assessed: the total, the grade, who and when, all or none. Verified: who and when, both or neither, only once assessed, and never by
-- the person who assessed it (ADR 0047 D6)
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_assessed" CHECK (("assessedByPersonId" IS NULL) = ("assessedAt" IS NULL) AND ("assessedAt" IS NULL) = ("scoreTotal" IS NULL) AND ("scoreTotal" IS NULL) = ("gradeLabel" IS NULL));
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_total" CHECK ("scoreTotal" IS NULL OR ("scoreTotal" >= 0 AND "scoreTotal" <= 100));
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_verified" CHECK (("verifiedByPersonId" IS NULL) = ("verifiedAt" IS NULL));
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_second_person" CHECK ("verifiedByPersonId" IS NULL OR ("assessedByPersonId" IS NOT NULL AND "verifiedByPersonId" <> "assessedByPersonId"));

-- ------------------------------------------------------------------ by hand: the draft makers and the issue

-- A third kind of draft is issued in turn: the CHECK on who may be a draft's maker is widened with it, as its own migration said
ALTER TABLE "ConfigurationDraftMaker" DROP CONSTRAINT "ConfigurationDraftMaker_entity_known";
ALTER TABLE "ConfigurationDraftMaker" ADD CONSTRAINT "ConfigurationDraftMaker_entity_known" CHECK ("entity" IN ('EvaluationModel', 'RateSchedule', 'PerformanceForm'));
CREATE TRIGGER "PerformanceForm_issue_guard" BEFORE UPDATE ON "PerformanceForm" FOR EACH ROW EXECUTE FUNCTION "guard_draft_issue"('PerformanceForm');

-- ------------------------------------------------------------------ by hand: a filed report is kept as filed

-- A verified report is filed: it and its scores are never changed or removed. Scores change only before the report is assessed
CREATE FUNCTION public."performance_report_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_report text;
  v_assessed timestamp;
BEGIN
  IF TG_TABLE_NAME = 'PerformanceReport' THEN
    IF OLD."verifiedAt" IS NOT NULL THEN
      RAISE EXCEPTION '% on "PerformanceReport" is refused: a verified report is filed and kept as filed', TG_OP
        USING ERRCODE = 'PA054', HINT = 'ADR 0047 D6.';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  v_report := CASE WHEN TG_OP = 'DELETE' THEN OLD."reportId" ELSE NEW."reportId" END;
  SELECT r."assessedAt" INTO v_assessed FROM "PerformanceReport" r WHERE r."id" = v_report;
  IF v_assessed IS NOT NULL THEN
    RAISE EXCEPTION '% on "PerformanceScore" is refused: the report is assessed, so its scores are fixed', TG_OP
      USING ERRCODE = 'PA054', HINT = 'ADR 0047 D6.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "PerformanceReport_filed" BEFORE UPDATE OR DELETE ON "PerformanceReport" FOR EACH ROW EXECUTE FUNCTION public."performance_report_guard"();
CREATE TRIGGER "PerformanceScore_fixed" BEFORE INSERT OR UPDATE OR DELETE ON "PerformanceScore" FOR EACH ROW EXECUTE FUNCTION public."performance_report_guard"();
ALTER TABLE "PerformanceReport" ENABLE ALWAYS TRIGGER "PerformanceReport_filed";
ALTER TABLE "PerformanceScore" ENABLE ALWAYS TRIGGER "PerformanceScore_fixed";
