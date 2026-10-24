-- RSAJ answers stage 2, B4 (answer 22): the numbering series an exercise of a method takes its reference from, issued
-- once when the exercise is opened. Null keeps the organisation's "exercise" series. Checked against the configured
-- series when the method is saved, as the dossier series is.

-- AlterTable
ALTER TABLE "SourcingMethod" ADD COLUMN     "exerciseSeriesKey" TEXT;
