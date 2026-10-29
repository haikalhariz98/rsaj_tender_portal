-- Two criteria of one form never share an order.
CREATE UNIQUE INDEX "PerformanceCriterion_formId_sortOrder_key" ON "PerformanceCriterion"("formId", "sortOrder");

-- The highest version ever given to a contract type's form, so a discarded draft's number is not given again.
CREATE TABLE "PerformanceFormSeries" (
    "organisationId" TEXT NOT NULL,
    "contractTypeCode" TEXT NOT NULL,
    "lastVersion" INTEGER NOT NULL,

    CONSTRAINT "PerformanceFormSeries_pkey" PRIMARY KEY ("organisationId","contractTypeCode")
);

ALTER TABLE "PerformanceFormSeries" ADD CONSTRAINT "PerformanceFormSeries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PerformanceFormSeries" ("organisationId", "contractTypeCode", "lastVersion")
SELECT "organisationId", "contractTypeCode", MAX("version") FROM "PerformanceForm" GROUP BY "organisationId", "contractTypeCode";
