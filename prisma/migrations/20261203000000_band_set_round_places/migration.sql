-- RSAJ answer 11 (2026-10-27): a band set may round a value half up to 0 to 4 places before it is banded. Null: not rounded.
-- AlterTable
ALTER TABLE "EvaluationBandSet" ADD COLUMN     "roundPlaces" INTEGER;

ALTER TABLE "EvaluationBandSet" ADD CONSTRAINT "EvaluationBandSet_roundPlaces_range" CHECK ("roundPlaces" IS NULL OR "roundPlaces" BETWEEN 0 AND 4);
