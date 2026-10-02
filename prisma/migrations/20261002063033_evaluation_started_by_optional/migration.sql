-- AlterTable
ALTER TABLE "Evaluation" ALTER COLUMN "startedByPersonId" DROP NOT NULL;

-- Hand-written: a version a committee's decision opened (LOOP) names no person, every other does.
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_started_by" CHECK (("trigger" = 'LOOP') OR ("startedByPersonId" IS NOT NULL));
